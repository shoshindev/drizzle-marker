// Checks that text on top of a mark stays readable in VS Code's own themes:
// every text color a theme uses that has a contrast ratio of at least 4.5:1 on
// the editor's background, the WCAG AA minimum, must keep it on top of a mark.
// Where a theme draws a line under the marks, the line needs 3:1 against the
// background, the minimum for a part of the interface.
//   npm run contrast
// It reads the themes from your VS Code install, and test/contrast.test.ts runs
// the same check.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const THEMES_FOLDER = '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/theme-defaults/themes';

// Each theme, with the default color of the marks that applies to it in
// package.json: `dark` or `light`, or the two for high-contrast themes.
export const THEMES: [string, string, 'dark' | 'light' | 'highContrast' | 'highContrastLight'][] = [
  ['Dark Modern', 'dark_modern.json', 'dark'],
  ['Light Modern', 'light_modern.json', 'light'],
  ['Dark High Contrast', 'hc_black.json', 'highContrast'],
  ['Light High Contrast', 'hc_light.json', 'highContrastLight'],
  ['Dark 2026', '2026-dark.json', 'dark'],
  ['Light 2026', '2026-light.json', 'light'],
];

const MINIMUM = 4.5;
const LINE_MINIMUM = 3;

type Rgba = [number, number, number, number];

function parse(hex: string): Rgba {
  const value = hex.replace('#', '');
  const full = value.length <= 4 ? [...value].map((digit) => digit + digit).join('') : value;
  const channels = full.match(/../g)!.map((pair) => parseInt(pair, 16));
  return [channels[0], channels[1], channels[2], channels.length > 3 ? channels[3] / 255 : 1];
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  return [0, 1, 2].map((index) => top[index] * alpha + bottom[index] * (1 - alpha)).concat(1) as Rgba;
}

function luminance([red, green, blue]: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// The kinds of text a mark can sit on: names, like variables, properties,
// functions and types, and strings. Marks never cover comments, keywords,
// operators or regular expressions, so their colors don't count.
const MARKED_SCOPES = /^(variable|entity\.name|support\.(function|type|class|variable|constant)|meta\.object-literal\.key|meta\.definition\.(variable|property|method)|string(?!\.regexp)|constant\.other|entity\.other\.inherited-class|meta\.type\.annotation)/;
const MARKED_SEMANTIC = /^(variable|property|function|method|type|class|interface|namespace|parameter|enumMember|enum|string|typeParameter)\b/;

// Scopes inside those that marks still never cover: HTML and JSX tags, `this`,
// preprocessor and operator names, parts of regular expressions, comments
// written as strings, and CSS.
const UNMARKED_SCOPES = /^(entity\.name\.(tag|function\.preprocessor|operator)|variable\.language|constant\.other\.(character-class|option|color|rgb-value)|string\.comment|support\.(type\.(property-name|vendored)|constant\.(property-value|font-name|media|color|math|dom|json)))/;

function scopesOf(rule: any): string[] {
  const scope = rule.scope ?? '';
  return (Array.isArray(scope) ? scope : String(scope).split(',')).map((item: string) => item.trim());
}

// A theme's colors and the text colors of its tokens, with what it includes.
function readTheme(file: string): { colors: Record<string, string>; foregrounds: string[] } {
  const theme = JSON.parse(readFileSync(file, 'utf8'));
  const parent = theme.include ? readTheme(join(dirname(file), theme.include)) : { colors: {}, foregrounds: [] };
  const tokens = (theme.tokenColors ?? [])
    .filter((rule: any) => scopesOf(rule).some((scope) => MARKED_SCOPES.test(scope) && !UNMARKED_SCOPES.test(scope)))
    .map((rule: any) => rule.settings?.foreground)
    .filter(Boolean);
  const semantic = Object.entries(theme.semanticTokenColors ?? {})
    .filter(([selector]) => MARKED_SEMANTIC.test(selector))
    .map(([, rule]: [string, any]) => (typeof rule === 'string' ? rule : rule?.foreground));
  return {
    colors: { ...parent.colors, ...theme.colors },
    foregrounds: [...parent.foregrounds, ...tokens, ...semantic.filter(Boolean)],
  };
}

// Svelte Marker's violet marks, which can sit in the same file, as in a
// SvelteKit +page.server.ts. These are its defaults.
const SVELTE_MARKER = { dark: '#8B5CF642', light: '#8B5CF62E', highContrast: '#8B5CF642', highContrastLight: '#8B5CF62E' };

export interface Report {
  theme: string;
  mark: string;
  // The lowest contrast of readable text with a violet mark of Svelte Marker's
  // under a mark of this one, and under a violet mark alone.
  stacked: number;
  violet: number;
  // The lowest contrast of any readable text color on top of a mark.
  lowest: number;
  color: string;
  failures: string[];
}

export function checkThemes(): Report[] {
  const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  const colorDefaults = (id: string) => packageJson.contributes.colors.find((item: any) => item.id === id).defaults;
  const defaults = colorDefaults('drizzleMarker.background');
  const lines = colorDefaults('drizzleMarker.underline');
  const reports: Report[] = [];
  for (const [name, file, kind] of THEMES) {
    const path = join(THEMES_FOLDER, file);
    if (!existsSync(path)) continue;
    const { colors, foregrounds } = readTheme(path);
    // A theme that sets no background gets VS Code's default for its kind.
    const defaultBackground = { dark: '#1E1E1E', light: '#FFFFFF', highContrast: '#000000', highContrastLight: '#FFFFFF' }[kind];
    const background = parse(colors['editor.background'] ?? defaultBackground);
    const marked = over(parse(defaults[kind]), background);
    const texts = [...new Set([colors['editor.foreground'], ...foregrounds].filter(Boolean).map((hex) => hex.toUpperCase()))];
    const report: Report = { theme: name, mark: defaults[kind], stacked: Infinity, violet: Infinity, lowest: Infinity, color: '', failures: [] };
    const violet = over(parse(SVELTE_MARKER[kind]), background);
    const both = over(parse(defaults[kind]), violet);
    for (const hex of texts) {
      // Text with a translucent color of its own sits on the mark too.
      const text = parse(hex);
      if (contrast(over(text, background), background) < MINIMUM) continue;
      const ratio = contrast(over(text, marked), marked);
      if (ratio < report.lowest) {
        report.lowest = ratio;
        report.color = hex;
      }
      if (ratio < MINIMUM) report.failures.push(`${hex} ${ratio.toFixed(2)}`);
      report.stacked = Math.min(report.stacked, contrast(over(text, both), both));
      report.violet = Math.min(report.violet, contrast(over(text, violet), violet));
    }
    const line = parse(lines[kind]);
    if (line[3] > 0) {
      const ratio = contrast(over(line, background), background);
      if (ratio < LINE_MINIMUM) report.failures.push(`underline ${lines[kind]} ${ratio.toFixed(2)}`);
    }
    reports.push(report);
  }
  return reports;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const report of checkThemes()) {
    const status = report.failures.length === 0 ? 'ok' : `too low: ${report.failures.join(', ')}`;
    console.log(
      `${report.theme.padEnd(20)} mark ${report.mark}  lowest ${report.lowest.toFixed(2)} (${report.color})  ${status}` +
        `  | with Svelte Marker's violet under it ${report.stacked.toFixed(2)}, violet alone ${report.violet.toFixed(2)}`,
    );
  }
}
