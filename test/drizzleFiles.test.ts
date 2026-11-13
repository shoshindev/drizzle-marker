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

test('a project without Drizzle only searches for drizzle-', () => {
  const files = new DrizzleFiles();
  files.addAll([['/app/src/a.ts', `export const a = 1;`]]);
  assert.equal(files.mightUse(`import { a } from './a';`), false);
  assert.ok(files.mightUse(`import 'drizzle-orm';`));
});
