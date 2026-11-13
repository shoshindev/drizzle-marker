// Checks that src/generatedShapes.json and test/drizzleExports.txt match the
// Drizzle packages installed. After updating one, or when a new version adds or
// renames an export, this fails until you run `npm run shapes`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EXPORTS_FILE, generateShapes, OUTPUT_FILE } from '../scripts/generateShapes.ts';
import { exportShape, hasMember, memberShape } from '../src/shapes.ts';

const generated = generateShapes();

test('the generated shapes match the installed packages', () => {
  assert.ok(
    generated.shapes === readFileSync(OUTPUT_FILE, 'utf8'),
    'src/generatedShapes.json is out of date: run `npm run shapes`',
  );
});

test('the list of exports matches the installed packages', () => {
  const listed = readFileSync(EXPORTS_FILE, 'utf8');
  if (generated.exports === listed) return;
  // Name what changed, so the failure says which exports are new or gone.
  const names = (text: string) =>
    new Set(
      text
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .flatMap((line) => {
          const [path, rest = ''] = line.split(': ');
          return rest.split(' ').filter(Boolean).map((name) => `${path}:${name}`);
        }),
    );
  const before = names(listed);
  const now = names(generated.exports);
  const added = [...now].filter((name) => !before.has(name)).slice(0, 20);
  const removed = [...before].filter((name) => !now.has(name)).slice(0, 20);
  assert.fail(
    `test/drizzleExports.txt is out of date: run \`npm run shapes\`.\n` +
      `New: ${added.join(' ') || 'none'}\nGone: ${removed.join(' ') || 'none'}\n` +
      `Versions now: ${generated.exports.split('\n')[0]}`,
  );
});

test('reads both the current release and the 1.0 release candidate', () => {
  const versions = generated.exports.split('\n')[0];
  assert.match(versions, /drizzle-orm 0\.45\.\d+/);
  assert.match(versions, /drizzle-orm-1 1\.0\.0-rc\.\d+/);
  // relations() is the current way to declare relations, and defineRelations()
  // the one 1.0 adds. Both are known, with what they pass to their callbacks.
  const relations = exportShape('drizzle-orm', 'relations');
  assert.ok(hasMember(relations?.args?.[1]?.args?.[0], 'many'));
  const defineRelations = exportShape('drizzle-orm', 'defineRelations');
  assert.ok(hasMember(defineRelations?.args?.[1]?.args?.[0], 'many'));
  // drizzle() takes `schema` in both, and `relations` in 1.0.
  const options = exportShape('drizzle-orm/node-postgres', 'drizzle')?.args?.[1];
  assert.ok(hasMember(options, 'schema'));
  assert.ok(hasMember(options, 'relations'));
  // A select works the same in both.
  const db = exportShape('drizzle-orm/node-postgres', 'drizzle')?.returns;
  const select = memberShape(memberShape(db, 'select')?.returns, 'from')?.returns;
  for (const name of ['where', 'innerJoin', 'orderBy', 'limit']) assert.ok(hasMember(select, name), name);
});
