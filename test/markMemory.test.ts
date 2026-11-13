import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarkMemory } from '../src/markMemory.ts';

const good = { marks: [{ start: 0, end: 3 }], complete: true };
const broken = { marks: [], complete: false };

test('paints the marks of a file that parses', () => {
  assert.deepEqual(new MarkMemory().marksToPaint('a', good, false), good.marks);
});

test('keeps the painted marks while the file is half-typed', () => {
  const memory = new MarkMemory();
  memory.marksToPaint('a', good, false);
  assert.equal(memory.marksToPaint('a', broken, true), undefined);
});

test('repaints a half-typed file with its last good marks when it comes back into view', () => {
  const memory = new MarkMemory();
  memory.marksToPaint('a', good, false);
  assert.deepEqual(memory.marksToPaint('a', broken, false), good.marks);
});

test('paints what it can for a file that has never parsed', () => {
  const memory = new MarkMemory();
  assert.deepEqual(memory.marksToPaint('a', broken, true), []);
});

test('forgets a closed file', () => {
  const memory = new MarkMemory();
  memory.marksToPaint('a', good, false);
  memory.forget('a');
  assert.deepEqual(memory.marksToPaint('a', broken, false), []);
});
