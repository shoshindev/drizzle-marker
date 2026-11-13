import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMarks, type Options } from '../src/findMarks.ts';

const TS: Options = { jsx: false, dts: false };

// The marked pieces of text, in order.
function marked(code: string, options: Options = TS): string[] {
  const { marks, complete } = findMarks(code, options);
  assert.ok(complete, 'the code should parse');
  return marks.map((mark) => code.slice(mark.start, mark.end));
}

test('marks the import path and the imported names', () => {
  assert.deepEqual(marked(`import { pgTable, text } from 'drizzle-orm/pg-core';`), [
    'pgTable',
    'text',
    'drizzle-orm/pg-core',
  ]);
});

test('marks every official package and nothing that only looks like one', () => {
  for (const path of [
    'drizzle-orm',
    'drizzle-orm/node-postgres',
    'drizzle-kit',
    'drizzle-zod',
    'drizzle-valibot',
    'drizzle-typebox',
    'drizzle-arktype',
    'drizzle-seed',
  ]) {
    assert.deepEqual(marked(`import '${path}';`), [path]);
  }
  assert.deepEqual(marked(`import { eq } from 'drizzle-orm-extra'; eq;`), []);
  assert.deepEqual(marked(`import { eq } from 'drizzle-cursor'; eq;`), []);
  assert.deepEqual(marked(`import { eq } from './drizzle-orm'; eq;`), []);
});

test('marks uses of an imported name in code and in types', () => {
  const code = `
    import { eq, sql, type SQL } from 'drizzle-orm';
    import type { InferSelectModel } from 'drizzle-orm';
    const where: SQL = eq(users.id, 1);
    const raw = sql\`select 1\`;
    type User = InferSelectModel<typeof users>;
  `;
  assert.deepEqual(marked(code), [
    'eq',
    'sql',
    'SQL',
    'drizzle-orm',
    'InferSelectModel',
    'drizzle-orm',
    'SQL',
    'eq',
    'sql',
    'InferSelectModel',
  ]);
});

test('leaves a name you chose unmarked', () => {
  const code = `
    import { eq as equals } from 'drizzle-orm';
    import drizzleKit from 'drizzle-kit';
    equals(a, b);
    drizzleKit;
  `;
  assert.deepEqual(marked(code), ['eq', 'drizzle-orm', 'drizzle-kit']);
});

test('marks the members of a namespace import but not its name', () => {
  const code = `
    import * as t from 'drizzle-orm/pg-core';
    const users = t.pgTable('users', { id: t.serial() });
    type Column = t.PgColumn;
  `;
  assert.deepEqual(marked(code), ['drizzle-orm/pg-core', 'pgTable', 'serial', 'PgColumn']);
});

test('leaves a local name that hides an import unmarked', () => {
  const code = `
    import { eq, sql, SQL } from 'drizzle-orm';
    function a(eq) { return eq; }
    const b = ({ sql }) => sql;
    try {} catch (sql) { sql; }
    function c<SQL>(value: SQL) {}
    { const eq = 1; eq; }
    for (const sql of list) sql;
    eq;
  `;
  assert.deepEqual(marked(code), ['eq', 'sql', 'SQL', 'drizzle-orm', 'eq']);
});

test('leaves keys and members that share a name unmarked', () => {
  const code = `
    import { eq } from 'drizzle-orm';
    const a = { eq: 1 };
    a.eq;
    class B { eq = 1; eq2() {} }
    interface C { eq: string; eq3(eq: number): void }
    type D = (eq: number) => void;
    enum E { eq }
    eq: for (;;) break eq;
  `;
  assert.deepEqual(marked(code), ['eq', 'drizzle-orm']);
});

test('marks a shorthand property and a computed key', () => {
  const code = `
    import { eq, sql } from 'drizzle-orm';
    const a = { eq, [sql]: 1 };
  `;
  assert.deepEqual(marked(code), ['eq', 'sql', 'drizzle-orm', 'eq', 'sql']);
});

test('marks names passed along by an export', () => {
  assert.deepEqual(marked(`export { eq, sql as s } from 'drizzle-orm';`), ['eq', 'sql', 'drizzle-orm']);
  assert.deepEqual(marked(`export * from 'drizzle-orm';`), ['drizzle-orm']);
  assert.deepEqual(marked(`export * as orm from 'drizzle-orm';`), ['drizzle-orm']);
  assert.deepEqual(marked(`import { eq } from 'drizzle-orm'; export { eq as equals };`), [
    'eq',
    'drizzle-orm',
    'eq',
  ]);
});

test('marks import paths outside import statements', () => {
  assert.deepEqual(marked(`const orm = await import('drizzle-orm');`), ['drizzle-orm']);
  assert.deepEqual(marked(`type T = import('drizzle-orm').SQL;`), ['drizzle-orm', 'SQL']);
  assert.deepEqual(marked(`declare module 'drizzle-orm' {}`), ['drizzle-orm']);
  assert.deepEqual(marked(`import orm = require('drizzle-orm'); orm.eq;`), ['drizzle-orm', 'eq']);
});

test('parses JSX in .tsx files and generics in .ts files', () => {
  const tsx = `import { eq } from 'drizzle-orm'; const a = <div title={eq}>{eq}</div>;`;
  assert.deepEqual(marked(tsx, { jsx: true, dts: false }), ['eq', 'drizzle-orm', 'eq', 'eq']);
  const ts = `import { eq } from 'drizzle-orm'; const a = <T,>(x: T) => eq;`;
  assert.deepEqual(marked(ts), ['eq', 'drizzle-orm', 'eq']);
});

test('parses .d.ts files', () => {
  const code = `import type { SQL } from 'drizzle-orm'; export function where(): SQL;`;
  assert.deepEqual(marked(code, { jsx: false, dts: true }), ['SQL', 'drizzle-orm', 'SQL']);
});

test('skips files that never mention Drizzle', () => {
  assert.deepEqual(findMarks(`import { eq } from 'other'; eq(`, TS), { marks: [], complete: true });
});

test('reports half-typed code as incomplete', () => {
  assert.deepEqual(findMarks(`import { eq } from 'drizzle-orm'; eq(`, TS), { marks: [], complete: false });
});
