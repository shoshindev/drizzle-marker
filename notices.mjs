// Writes THIRD-PARTY-NOTICES.md. The extension bundles acorn and its TypeScript
// plugin, so their licenses ship with it. Packaging runs this, so the file always
// matches the pinned versions.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

function readPackage(name) {
  return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
}

function section(name) {
  const { version, license, author } = readPackage(name);
  const file = readdirSync(`node_modules/${name}`).find((entry) => /^licen[cs]e/i.test(entry));
  const text = file
    ? readFileSync(`node_modules/${name}/${file}`, 'utf8').trim()
    : `${license}, by ${author?.name ?? author}. This package includes no license file.`;
  return `## ${name} ${version}\n\nLicense: ${license}\n\n\`\`\`text\n${text}\n\`\`\``;
}

const intro = `# Third-party notices

Drizzle Marker includes the acorn parser and its TypeScript plugin. Their licenses are below.`;

writeFileSync(
  'THIRD-PARTY-NOTICES.md',
  [intro, ...['acorn', '@sveltejs/acorn-typescript'].map(section)].join('\n\n') + '\n',
);
