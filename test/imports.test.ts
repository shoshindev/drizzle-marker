import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { importReader, usesDrizzle, withoutComments } from '../src/imports.ts';

// A small project on disk, with each way a project names its own files.
const root = mkdtempSync(join(tmpdir(), 'drizzle-marker-imports-'));
after(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

write(
  'package.json',
  JSON.stringify({ dependencies: { 'drizzle-orm': '^0.45.0' }, imports: { '#lib/*': './src/lib/*' } }),
);
write(
  'tsconfig.json',
  `{
    // Comments and trailing commas are allowed here.
    "compilerOptions": { "paths": { "@/*": ["./src/*"], }, },
  }`,
);
write('src/lib/server/db/index.ts', 'export const db = 1;');
write('src/lib/schema.ts', 'export const users = 1;');
write('src/routes/page.ts', '');

const from = join(root, 'src/routes/page.ts');
const read = importReader();
const found = (path: string) => read(path, from)?.fileName.slice(root.length + 1);

test('follows relative paths, with or without an extension, and folders', () => {
  assert.equal(found('../lib/schema'), 'src/lib/schema.ts');
  assert.equal(found('../lib/schema.js'), 'src/lib/schema.ts');
  assert.equal(found('../lib/server/db'), 'src/lib/server/db/index.ts');
});

test('follows the imports in package.json', () => {
  assert.equal(found('#lib/server/db/index.js'), 'src/lib/server/db/index.ts');
});

test('follows paths in tsconfig.json', () => {
  assert.equal(found('@/lib/schema'), 'src/lib/schema.ts');
});

test("follows SvelteKit's $lib", () => {
  assert.equal(found('$lib/server/db'), 'src/lib/server/db/index.ts');
});

test("doesn't follow packages or files that aren't there", () => {
  assert.equal(found('postgres'), undefined);
  assert.equal(found('./missing'), undefined);
});

test('reads the unsaved text of a file open in the editor', () => {
  const fileName = join(root, 'src/lib/schema.ts');
  const open = importReader((name) => (name === fileName ? { text: 'unsaved', version: 7 } : undefined));
  assert.deepEqual(open('../lib/schema', from), { fileName, text: 'unsaved', version: 'open:7' });
});

test('knows whether a project uses Drizzle', () => {
  assert.equal(usesDrizzle(from), true);
  write('other/package.json', JSON.stringify({ dependencies: { postgres: '^3.0.0' } }));
  write('other/a.ts', '');
  assert.equal(usesDrizzle(join(root, 'other/a.ts')), false);
});

test('reads tsconfig.json comments without breaking strings that look like them', () => {
  assert.deepEqual(JSON.parse(withoutComments('{ "a": "@/*", /* b */ "c": "//d", }')), { a: '@/*', c: '//d' });
});
