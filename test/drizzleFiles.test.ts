import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DrizzleFiles } from '../src/drizzleFiles.ts';

function project() {
  const files = new DrizzleFiles();
  files.addAll([
    ['/app/src/lib/server/db/index.js', `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);`],
    ['/app/src/lib/server/db/schema.js', `import { pgTable } from 'drizzle-orm/pg-core';\nexport const goals = pgTable('goals', {});`],
    ['/app/src/lib/server/index.ts', `export { db } from './db';`],
    ['/app/src/lib/periods.js', `export function listPeriods() { return []; }`],
  ]);
  return files;
}

test('a file that names Drizzle might use it', () => {
  assert.ok(project().mightUse(`import { eq } from 'drizzle-orm';`));
});

test('a file that imports one of your files that use Drizzle might use it', () => {
  const files = project();
  assert.ok(files.mightUse(`import { db } from '#lib/server/db/index.js';`));
  assert.ok(files.mightUse(`import { db } from '$lib/server/db';`));
  assert.ok(files.mightUse(`import { goals } from '../lib/server/db/schema';`));
  // Through a file that passes `db` along.
  assert.ok(files.has('/app/src/lib/server/index.ts'));
  assert.ok(files.mightUse(`import { db } from '$lib/server';`));
});

test('any other file can be ruled out with one text search', () => {
  const files = project();
  assert.equal(files.mightUse(`import { listPeriods } from '#lib/periods.js';\nconst schema = 1;`), false);
  assert.equal(files.mightUse(`import { readFile } from 'node:fs';`), false);
  // The name has to be a whole part of the path, not the end of a longer one.
  assert.equal(files.mightUse(`import x from './myschema';`), false);
  const text = `import { readFile } from 'node:fs';\nexport const answer = 42;\n`.repeat(2000);
  const started = performance.now();
  for (let run = 0; run < 10; run++) files.mightUse(text);
  assert.ok((performance.now() - started) / 10 < 1, 'a 100 KB file should take under 1 ms');
});

test('follows edits: a file that starts or stops using Drizzle', () => {
  const files = project();
  assert.equal(files.update('/app/src/lib/cache.ts', `import { sql } from 'drizzle-orm';`), true);
  assert.ok(files.mightUse(`import { cached } from '$lib/cache';`));
  assert.equal(files.update('/app/src/lib/cache.ts', `export const cached = 1;`), true);
  assert.equal(files.mightUse(`import { cached } from '$lib/cache';`), false);
  assert.equal(files.update('/app/src/lib/cache.ts', `export const cached = 2;`), false);
});

test("a bare $lib import leads to src/lib's index file", () => {
  const files = new DrizzleFiles();
  files.addAll([['/app/src/lib/index.ts', `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);`]]);
  assert.ok(files.mightUse(`import { db } from '$lib';`));
});

test('a file that passes db along counts once the file behind it starts using Drizzle', () => {
  const files = new DrizzleFiles();
  files.addAll([
    ['/app/src/lib/server/db.ts', `export const db = 1;`],
    ['/app/src/lib/server/index.ts', `export * from './db';`],
    ['/app/src/lib/index.ts', `export * from './server';`],
  ]);
  assert.equal(files.mightUse(`import { db } from '../lib';`), false);

  const drizzle = `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);`;
  assert.equal(files.update('/app/src/lib/server/db.ts', drizzle), true);
  assert.ok(files.has('/app/src/lib/server/index.ts'));
  assert.ok(files.has('/app/src/lib/index.ts'));
  assert.ok(files.mightUse(`import { db } from '../lib';`));
  assert.ok(files.mightUse(`import { db } from '$lib';`));

  // And the chain stops counting when the file behind it stops, or goes.
  assert.equal(files.update('/app/src/lib/server/db.ts', `export const db = 1;`), true);
  assert.equal(files.has('/app/src/lib/index.ts'), false);
  assert.equal(files.mightUse(`import { db } from '../lib';`), false);
  files.update('/app/src/lib/server/db.ts', drizzle);
  assert.equal(files.remove('/app/src/lib/server/db.ts'), true);
  assert.equal(files.has('/app/src/lib/index.ts'), false);
});

test('a package of your monorepo that uses Drizzle counts by its name', () => {
  // Each folder in packages/ is a package named after it, like @repo/db.
  const files = new DrizzleFiles((fileName) => {
    const folder = /\/packages\/(\w+)\//.exec(fileName)?.[1];
    return folder ? `@repo/${folder}` : undefined;
  });
  files.addAll([
    ['/repo/packages/db/src/client.ts', `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);`],
    ['/repo/packages/api/src/main.ts', `export { db } from '@repo/db';`],
    ['/repo/packages/ui/src/button.ts', `export const button = 1;`],
  ]);
  assert.ok(files.mightUse(`import { db } from '@repo/db';`));
  assert.ok(files.mightUse(`import { users } from '@repo/db/schema';`));
  // Through a package that passes `db` along.
  assert.ok(files.mightUse(`import { db } from "@repo/api";`));
  assert.equal(files.mightUse(`import { db } from '@repo/dbx';`), false);
  assert.equal(files.mightUse(`import { button } from '@repo/ui';`), false);
});

test('a file passes Drizzle along exactly when importing the same path would get it parsed', () => {
  const paths = [
    '$lib', '$lib/server/db', '#lib/server/db/index.js', '~/db', './db', './db.js', './db/index', './db/index.ts',
    '../server', '@repo/db', '@repo/db/schema', '@repo/dbx', 'db', 'db/client', './mydb', './db/other',
  ];
  for (const path of paths) {
    const files = new DrizzleFiles((fileName) => (fileName.includes('/lib/') ? '@repo/db' : undefined));
    const text = `export * from '${path}';`;
    files.addAll([
      ['/app/src/lib/server/db/index.ts', `import { drizzle } from 'drizzle-orm/postgres-js';\nexport const db = drizzle(url);`],
      ['/app/src/other.ts', text],
    ]);
    assert.equal(files.has('/app/src/other.ts'), files.mightUse(text), path);
  }
});

test('a project without Drizzle only searches for drizzle-', () => {
  const files = new DrizzleFiles();
  files.addAll([['/app/src/a.ts', `export const a = 1;`]]);
  assert.equal(files.mightUse(`import { a } from './a';`), false);
  assert.ok(files.mightUse(`import 'drizzle-orm';`));
});
