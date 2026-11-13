import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { findMarks } from '../src/findMarks.ts';
import { importReader, packageNameOf, usesDrizzle, withoutComments } from '../src/imports.ts';

// A small project on disk, with each way a project names its own files. Its
// real path, since the temporary folder can be behind a link, as on macOS.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'drizzle-marker-imports-')));
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

// A monorepo, whose package manager links its own packages into node_modules.
write('mono/package.json', JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*', 'packages/*'] }));
write(
  'mono/packages/db/package.json',
  JSON.stringify({
    name: '@repo/db',
    exports: { '.': './src/index.ts', './schema': { types: './src/schema.ts', default: './dist/schema.js' } },
    dependencies: { 'drizzle-orm': '^0.45.0' },
  }),
);
write(
  'mono/packages/db/src/index.ts',
  `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);\nexport * from './schema';`,
);
write('mono/packages/db/src/schema.ts', `import { pgTable, text } from 'drizzle-orm/pg-core';\nexport const users = pgTable('users', { name: text() });`);
write('mono/packages/utils/package.json', JSON.stringify({ name: 'utils', main: './lib/main.js' }));
write('mono/packages/utils/lib/main.ts', 'export const add = 1;');
write('mono/apps/web/package.json', JSON.stringify({ name: 'web', dependencies: { '@repo/db': '*', utils: '*', postgres: '*' } }));
write('mono/apps/docs/package.json', JSON.stringify({ name: 'docs', dependencies: { utils: '*' } }));
write('mono/apps/web/src/page.ts', '');
write('mono/apps/docs/src/page.ts', '');
write('mono/node_modules/postgres/package.json', JSON.stringify({ name: 'postgres', main: './index.js' }));
write('mono/node_modules/postgres/index.js', '');
mkdirSync(join(root, 'mono/node_modules/@repo'));
symlinkSync('../../packages/db', join(root, 'mono/node_modules/@repo/db'));
symlinkSync('../packages/utils', join(root, 'mono/node_modules/utils'));

const app = join(root, 'mono/apps/web/src/page.ts');
const foundFromApp = (path: string) => read(path, app)?.fileName.slice(root.length + 1);

test('follows the packages of your own monorepo, through their exports or main', () => {
  assert.equal(foundFromApp('@repo/db'), 'mono/packages/db/src/index.ts');
  assert.equal(foundFromApp('@repo/db/schema'), 'mono/packages/db/src/schema.ts');
  assert.equal(foundFromApp('utils'), 'mono/packages/utils/lib/main.ts');
  // A package you installed isn't followed, and neither is a path its exports don't list.
  assert.equal(foundFromApp('postgres'), undefined);
  assert.equal(foundFromApp('@repo/db/missing'), undefined);
});

test('a monorepo app uses Drizzle when one of its own packages does', () => {
  assert.equal(usesDrizzle(app), true);
  assert.equal(usesDrizzle(join(root, 'mono/apps/docs/src/page.ts')), false);
  assert.equal(packageNameOf(join(root, 'mono/packages/db/src/index.ts')), '@repo/db');
});

test("marks a monorepo app's use of db from one of its own packages", () => {
  const text = `import { db, users } from '@repo/db';\nexport const load = () => db.select().from(users);`;
  const { marks } = findMarks(text, { jsx: false, dts: false }, { fileName: app, readImport: read });
  assert.deepEqual(
    marks.map((mark) => text.slice(mark.start, mark.end)),
    ['select', 'from'],
  );
});
