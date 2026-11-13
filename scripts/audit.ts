// Runs the marker over real projects, to find wrong or missing marks and slow
// files that the small examples in the tests can't show. Pass one or more folders:
//   npm run audit-marks -- ../my-app
// It prints every distinct piece of text that got a mark, so an odd one stands
// out, then every member name, like `where` in `q.where()`, and object key left
// unmarked, so a missing one stands out, then the slowest files. With --view, it
// prints each file that got marks instead, with every mark as ⟦this⟧.

import { tsPlugin } from '@sveltejs/acorn-typescript';
import { Parser } from 'acorn';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findMarks } from '../src/findMarks.ts';
import { importReader, usesDrizzle } from '../src/imports.ts';
import { showMarks } from '../test/view.ts';

// Folders that hold builds or dependencies. Hidden folders, like .git and
// .svelte-kit, are skipped too, since they hold tools' files and copies of the project.
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage']);
const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SLOWEST_FILES = 5;

function codeFiles(path: string): string[] {
  if (statSync(path).isFile()) return CODE_FILE.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name)) return [];
    const full = join(path, entry.name);
    return entry.isDirectory() ? codeFiles(full) : CODE_FILE.test(entry.name) ? [full] : [];
  });
}

const args = process.argv.slice(2);
const view = args.includes('--view');
const roots = args.filter((arg) => !arg.startsWith('--'));
const readImport = importReader();
const counts = new Map<string, number>();
const unmarked = new Map<string, number>();
const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

// Notes each member name and object key in a file that didn't get a mark.
function noteUnmarked(text: string, jsx: boolean, starts: Set<number>) {
  let tree: any;
  try {
    tree = Parser.extend(tsPlugin({ jsx })).parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch {
    return;
  }
  const walk = (node: any) => {
    if (!node || typeof node.type !== 'string') return;
    const name =
      node.type === 'MemberExpression' && !node.computed ? node.property : node.type === 'Property' && !node.computed ? node.key : null;
    if (name?.type === 'Identifier' && !starts.has(name.start)) count(unmarked, node.type === 'Property' ? `${name.name}:` : `.${name.name}`);
    for (const field in node) {
      if (field === 'loc') continue;
      const value = node[field];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(tree);
}
const timings: [string, number][] = [];

for (const root of roots) {
  for (const file of codeFiles(root)) {
    const text = readFileSync(file, 'utf8');
    const options = { jsx: !/\.[cm]?ts$/.test(file), dts: /\.d\.[cm]?ts$/.test(file) };
    const context = usesDrizzle(file) ? { fileName: file, readImport } : { fileName: file };
    findMarks(text, options, context); // warm up, as the editor does after its first paint
    const started = performance.now();
    const { marks, complete } = findMarks(text, options, context);
    timings.push([relative(process.cwd(), file), performance.now() - started]);
    if (!complete) console.log(`Couldn't parse ${relative(process.cwd(), file)}`);
    if (view && marks.length > 0) console.log(`\n── ${relative(process.cwd(), file)}\n${showMarks(text, marks)}`);
    for (const mark of marks) count(counts, text.slice(mark.start, mark.end));
    if (!view) noteUnmarked(text, options.jsx, new Set(marks.map((mark) => mark.start)));
  }
}

const list = (map: Map<string, number>) =>
  [...map]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([piece, times]) => `${piece} ×${times}`)
    .join('  ');
if (!view) {
  console.log(`Marked text, most common first:\n${list(counts)}`);
  console.log(`\nMember names and keys left unmarked:\n${list(unmarked)}`);
}
console.log('\nSlowest files:');
for (const [file, ms] of timings.sort((a, b) => b[1] - a[1]).slice(0, SLOWEST_FILES)) {
  console.log(`  ${ms.toFixed(1).padStart(6)} ms  ${file}`);
}
