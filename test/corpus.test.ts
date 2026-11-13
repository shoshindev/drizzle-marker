// Checks the marker against real code. test/corpus holds the test set: real
// files, each with a hand-written list of the marks it should get, in a .marks
// file next to it. test/snapshots holds more pages of Drizzle's docs with the
// marks they got when they were last checked, written into the text as ⟦this⟧.
// For both, the files are cut off at many points, as if half-typed, and timed.
// See test/corpus/README.md.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findMarks, type Context, type Mark, type Options } from '../src/findMarks.ts';
import { importReader } from '../src/imports.ts';
import { readMarks, showMarks } from './view.ts';

const CORPUS = fileURLToPath(new URL('corpus/', import.meta.url));
const SNAPSHOTS = fileURLToPath(new URL('snapshots/', import.meta.url));
const CODE_FILE = /\.[cm]?[jt]sx?$/;

function filesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}

// The files, written out to a temporary folder so imports between them can be
// followed as they are in a real project.
const folder = mkdtempSync(join(tmpdir(), 'drizzle-marker-corpus-'));
after(() => rmSync(folder, { recursive: true, force: true }));

interface CorpusFile {
  name: string;
  fileName: string;
  text: string;
  // The hand-written list, by line number, for a file in the test set.
  expected?: Map<number, string[]>;
  // The marked text, for a snapshot.
  snapshot?: string;
}

// Reads a .marks file: `12: select, from, where` for each line with marks.
function readList(text: string): Map<number, string[]> {
  const lines = new Map<number, string[]>();
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const match = line.match(/^(\d+): (.+)$/);
    assert.ok(match, `Can't read the line "${line}"`);
    lines.set(Number(match[1]), match[2].split(', '));
  }
  return lines;
}

const files: CorpusFile[] = [];
for (const source of filesIn(CORPUS)) {
  const name = relative(CORPUS, source);
  if (name === 'README.md' || name.endsWith('.marks')) continue;
  const fileName = join(folder, 'corpus', name);
  mkdirSync(dirname(fileName), { recursive: true });
  const text = readFileSync(source, 'utf8');
  writeFileSync(fileName, text);
  if (!CODE_FILE.test(name)) continue;
  files.push({ name, fileName, text, expected: readList(readFileSync(`${source}.marks`, 'utf8')) });
}
for (const source of filesIn(SNAPSHOTS)) {
  if (!source.endsWith('.marked')) continue;
  const name = relative(SNAPSHOTS, source).replace(/\.marked$/, '');
  const fileName = join(folder, 'snapshots', name);
  mkdirSync(dirname(fileName), { recursive: true });
  const snapshot = readFileSync(source, 'utf8');
  const { text } = readMarks(snapshot);
  writeFileSync(fileName, text);
  files.push({ name: `snapshots/${name}`, fileName, text, snapshot });
}

const readImport = importReader();
const optionsFor = (fileName: string): Options => ({ jsx: !/\.[cm]?ts$/.test(fileName), dts: false });
const contextFor = (fileName: string): Context => ({ fileName, readImport });

// The marks of a file by line, as a .marks file lists them.
function byLine(text: string, marks: Mark[]): Map<number, string[]> {
  const lines = new Map<number, string[]>();
  for (const mark of marks) {
    const line = text.slice(0, mark.start).split('\n').length;
    lines.set(line, [...(lines.get(line) ?? []), text.slice(mark.start, mark.end)]);
  }
  return lines;
}

function differences(want: Map<number, string[]>, got: Map<number, string[]>): string[] {
  const lines = [...new Set([...want.keys(), ...got.keys()])].sort((a, b) => a - b);
  return lines
    .filter((line) => (want.get(line) ?? []).join(', ') !== (got.get(line) ?? []).join(', '))
    .map((line) => `line ${line}\n  want: ${(want.get(line) ?? []).join(', ')}\n  got:  ${(got.get(line) ?? []).join(', ')}`);
}

test('the test set has the files the README describes', () => {
  const set = files.filter((file) => file.expected);
  assert.equal(set.filter((file) => file.name.startsWith('horizons/')).length, 4);
  for (const dialect of ['pg', 'mysql', 'sqlite']) {
    assert.ok(set.some((file) => file.name.startsWith(`docs/${dialect}/`)), dialect);
  }
});

for (const file of files) {
  test(`marks ${file.name} as ${file.expected ? 'the hand-written list says' : 'its snapshot shows'}`, () => {
    const { marks, complete } = findMarks(file.text, optionsFor(file.fileName), contextFor(file.fileName));
    assert.ok(complete, 'the file should parse');
    if (file.expected) {
      const wrong = differences(file.expected, byLine(file.text, marks));
      assert.ok(wrong.length === 0, wrong.slice(0, 20).join('\n'));
    } else {
      const actual = showMarks(file.text, marks);
      if (actual !== file.snapshot) {
        const want = byLine(readMarks(file.snapshot!).text, readMarks(file.snapshot!).marks);
        assert.fail(differences(want, byLine(file.text, marks)).slice(0, 20).join('\n'));
      }
    }
  });
}

// A small random number generator with a fixed seed, so a failure can be
// reproduced: the same cut-off points every run.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('never throws on half-typed versions of the files', () => {
  const random = seeded(42);
  for (const file of files) {
    const cuts = new Set<number>();
    for (let step = 1; step <= 30; step++) cuts.add(Math.floor((file.text.length * step) / 31));
    for (let count = 0; count < 30; count++) cuts.add(Math.floor(random() * file.text.length));
    for (const cut of cuts) {
      const text = file.text.slice(0, cut);
      let result;
      try {
        result = findMarks(text, optionsFor(file.fileName), contextFor(file.fileName));
      } catch (error) {
        assert.fail(`${file.name}, cut at ${cut}: ${(error as Error).stack}`);
      }
      for (const mark of result.marks) {
        assert.ok(mark.start >= 0 && mark.start < mark.end && mark.end <= text.length, `${file.name}, cut at ${cut}`);
      }
    }
  }
});

test('finds marks in under 10 ms for a typical file and under 50 ms for any', () => {
  const timings = files.map((file) => {
    const options = optionsFor(file.fileName);
    const context = contextFor(file.fileName);
    findMarks(file.text, options, context); // the editor's first paint warms up the same way
    const runs: number[] = [];
    for (let run = 0; run < 5; run++) {
      const started = performance.now();
      findMarks(file.text, options, context);
      runs.push(performance.now() - started);
    }
    return { name: file.name, ms: runs.sort((a, b) => a - b)[2] };
  });
  const sorted = timings.map((timing) => timing.ms).sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)];
  const slowest = timings.reduce((a, b) => (b.ms > a.ms ? b : a));
  assert.ok(typical < 10, `typical file took ${typical.toFixed(1)} ms`);
  assert.ok(slowest.ms < 50, `${slowest.name} took ${slowest.ms.toFixed(1)} ms`);
});
