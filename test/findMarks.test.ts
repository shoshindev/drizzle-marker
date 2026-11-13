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

// Marks in code that uses Drizzle's values, read from in-memory files. `files`
// holds other files, by name, for imports like `./db` to lead to.
function markedWith(code: string, files: Record<string, string> = {}, options: Options = TS): string[] {
  const context = {
    fileName: '/project/src/main.ts',
    readImport(path: string) {
      const name = path.replace(/^\.\//, '').replace(/\.(js|ts)$/, '');
      const text = files[name];
      // The text stands in for a version, so files with the same name in different
      // tests are never mixed up by the cache of parsed files.
      return text === undefined ? null : { fileName: `/project/src/${name}.ts`, text, version: text };
    },
  };
  const { marks, complete } = findMarks(code, options, context);
  assert.ok(complete, 'the code should parse');
  return marks.map((mark) => code.slice(mark.start, mark.end));
}

const SCHEMA = `
  import { pgTable, integer, text } from 'drizzle-orm/pg-core';
  export const users = pgTable('users', { id: integer().primaryKey(), name: text() });
`;
const DB = `
  import { drizzle } from 'drizzle-orm/node-postgres';
  import * as schema from './schema';
  export const db = drizzle(process.env.DATABASE_URL, { schema });
`;

test('marks the methods of what Drizzle returns, but not your column names', () => {
  assert.deepEqual(markedWith(SCHEMA).slice(4), ['pgTable', 'integer', 'primaryKey', 'text']);
  assert.deepEqual(
    markedWith(`import { text } from 'drizzle-orm/pg-core'; const name = text('name').notNull().default('x');`),
    ['text', 'drizzle-orm/pg-core', 'text', 'notNull', 'default'],
  );
});

test('keeps all of a column builder after a method that returns it', () => {
  // defaultNow() is on timestamps only, and notNull() is declared on every column.
  const code = `import { timestamp } from 'drizzle-orm/pg-core'; timestamp().notNull().defaultNow();`;
  assert.deepEqual(markedWith(code).slice(2), ['timestamp', 'notNull', 'defaultNow']);
});

test('marks option keys and the strings Drizzle fixes, but not your strings', () => {
  const code = `
    import { timestamp, integer } from 'drizzle-orm/pg-core';
    timestamp('created_at', { withTimezone: true, mode: 'date' });
    integer().references(() => users.id, { onDelete: 'cascade' });
  `;
  assert.deepEqual(markedWith(code).slice(3), [
    'timestamp',
    'withTimezone',
    'mode',
    'date',
    'integer',
    'references',
    'onDelete',
    'cascade',
  ]);
});

test('marks the keys of a config, also when it is set apart or typed', () => {
  const config = `{ dialect: 'postgresql', schema: './src/schema.ts', dbCredentials: { url: 'postgres://' } }`;
  const expected = ['dialect', 'postgresql', 'schema', 'dbCredentials', 'url'];
  assert.deepEqual(
    markedWith(`import { defineConfig } from 'drizzle-kit'; export default defineConfig(${config});`).slice(3),
    expected,
  );
  assert.deepEqual(
    markedWith(`import { defineConfig } from 'drizzle-kit'; const config = ${config}; defineConfig(config);`).slice(2, -1),
    expected,
  );
  assert.deepEqual(markedWith(`import type { Config } from 'drizzle-kit'; export default ${config} satisfies Config;`).slice(2, -1), expected);
  assert.deepEqual(markedWith(`import type { Config } from 'drizzle-kit'; const config: Config = ${config};`).slice(3), expected);
});

test('follows a query from db to the end of the chain', () => {
  const code = `
    import { drizzle } from 'drizzle-orm/node-postgres';
    import { eq } from 'drizzle-orm';
    const db = drizzle(process.env.DATABASE_URL);
    await db.select({ id: users.id }).from(users).leftJoin(posts, eq(posts.userId, users.id)).where(eq(users.id, 1)).limit(1);
  `;
  assert.deepEqual(markedWith(code).slice(5), ['select', 'from', 'leftJoin', 'eq', 'where', 'eq', 'limit']);
});

test('marks what Drizzle passes to your callbacks', () => {
  const relations = `
    import { relations } from 'drizzle-orm';
    relations(users, ({ one, many }) => ({ posts: many(posts), owner: one(users, { fields: [x], references: [y] }) }));
  `;
  assert.deepEqual(markedWith(relations).slice(3), ['one', 'many', 'many', 'one', 'fields', 'references']);
  const transaction = `
    import { drizzle } from 'drizzle-orm/node-postgres';
    const db = drizzle(url);
    await db.transaction(async (tx) => { await tx.insert(users).values({ name: 'Dan' }); tx.rollback(); });
  `;
  assert.deepEqual(markedWith(transaction).slice(3), ['transaction', 'insert', 'values', 'rollback']);
});

test('marks 1.0 relations and relational queries', () => {
  const code = `
    import { defineRelations } from 'drizzle-orm';
    import { drizzle } from 'drizzle-orm/node-postgres';
    const relations = defineRelations({ users, posts }, (r) => ({
      users: { posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }) },
    }));
    const db = drizzle(url, { relations });
    db.query.users.findMany({ where: { OR: [{ id: { gt: 1 } }, { name: 'Dan' }] }, with: { posts: { limit: 5 } } });
  `;
  assert.deepEqual(markedWith(code).slice(4), [
    'defineRelations',
    'many',
    'from',
    'to',
    'drizzle',
    'relations',
    'query',
    'findMany',
    'where',
    'OR',
    'gt',
    'with',
    'limit',
  ]);
});

test('follows db and tables from another file of yours', () => {
  const code = `
    import { db } from './db';
    import { users } from './schema';
    const rows = await db.select().from(users).where(eq(users.id, 1));
    type User = typeof users.$inferSelect;
    db.query.users.findFirst();
  `;
  assert.deepEqual(markedWith(code, { db: DB, schema: SCHEMA }), [
    'select',
    'from',
    'where',
    '$inferSelect',
    'query',
    'findFirst',
  ]);
});

test('follows db through a function of yours that makes it', () => {
  const file = `
    import { drizzle } from 'drizzle-orm/d1';
    export const getDb = (binding) => drizzle(binding);
    export function makeDb(binding) { const db = drizzle(binding); return db; }
  `;
  const code = `import { getDb, makeDb } from './db'; getDb(env.DB).select(); makeDb(env.DB).insert(users);`;
  assert.deepEqual(markedWith(code, { db: file }), ['select', 'insert']);
});

test('reads what a parameter holds from its type', () => {
  const code = `
    import type { PgTransaction } from 'drizzle-orm/pg-core';
    import type { db } from './db';
    async function save(tx: PgTransaction<any, any, any>, other: typeof db) { await tx.insert(users); other.select(); }
  `;
  assert.deepEqual(markedWith(code, { db: DB }).slice(2), ['PgTransaction', 'insert', 'select']);
});

test('marks names taken out of what Drizzle gives', () => {
  const code = `
    import { drizzle } from 'drizzle-orm/node-postgres';
    const db = drizzle(url);
    const { query, select: pick } = db;
    query.users.findMany();
    pick();
  `;
  assert.deepEqual(markedWith(code).slice(3), ['query', 'select', 'query', 'findMany']);
});

test('marks the methods of a class you make', () => {
  const code = `
    import { QueryBuilder, PgDialect } from 'drizzle-orm/pg-core';
    const qb = new QueryBuilder();
    qb.select().from(users);
    new PgDialect().sqlToQuery(query);
  `;
  assert.deepEqual(markedWith(code).slice(3), ['QueryBuilder', 'select', 'from', 'PgDialect', 'sqlToQuery']);
});

test('leaves names you chose unmarked, even when they hold something of Drizzle', () => {
  const code = `
    import { drizzle } from 'drizzle-orm/node-postgres';
    const database = drizzle(url);
    const select = 1;
    database.query.users.findMany({ columns: { id: true }, with: { posts: true } });
    const users = { select: 1 };
    users.select;
  `;
  assert.deepEqual(markedWith(code).slice(3), ['query', 'findMany', 'columns', 'with']);
});
