// Which of your files use Drizzle, so that any other file costs one text search.
//
// A file uses Drizzle when it names one of Drizzle's packages, like
// `drizzle-orm/pg-core`, or when it imports one of your files that does, like a
// route that imports `db` from `$lib/server/db`. The first is a search for
// `drizzle-`. The second would mean following every import, so instead this
// notes which of your files name Drizzle, and builds one regular expression that
// finds either `drizzle-` or an import path that leads to one of them. A file it
// doesn't match can't get a mark, so it isn't parsed at all.

import { basename, dirname } from 'node:path';

const CODE_EXTENSION = /\.[cm]?[jt]sx?$/;
const INDEX_FILE = /\/index(?:\.[cm]?[jt]sx?)?$/;

// The name an import path ends with for a file: `schema` for schema.ts, and the
// folder's name for an index file, as in `$lib/server/db` for db/index.ts.
function importName(fileName: string): string {
  const stem = basename(fileName).replace(CODE_EXTENSION, '');
  return stem === 'index' ? basename(dirname(fileName)) : stem;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What the quoted paths in a file can lead to: the names they end with, and the
// packages they start with.
interface Paths {
  names: Set<string>;
  packages: Set<string>;
}

// The text between a quote and the next one on the same line, at every quote,
// so an apostrophe in a comment can't hide the paths after it.
const QUOTED = /(?=['"`]([^'"`\n]*)['"`])/g;

// The quoted paths of a file, read the way mightUse's expression reads them:
// `db` in `'$lib/server/db'` and in `'./db/index.js'`, `lib` in `'$lib'`, and the
// package `@repo/db` in `'@repo/db/schema'`.
function pathsIn(text: string): Paths {
  const paths: Paths = { names: new Set(), packages: new Set() };
  const addName = (name: string) => {
    if (!name) return;
    paths.names.add(name);
    if (/^[#~$]/.test(name)) paths.names.add(name.slice(1));
  };
  for (const [, path] of text.matchAll(QUOTED)) {
    const stem = path.replace(INDEX_FILE, '');
    const last = stem.slice(stem.lastIndexOf('/') + 1);
    addName(last);
    addName(last.replace(CODE_EXTENSION, ''));
    if (/^[^./]/.test(path)) paths.packages.add(path.split('/').slice(0, path.startsWith('@') ? 2 : 1).join('/'));
  }
  return paths;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((item) => b.has(item));

function samePaths(a: Paths | undefined, b: Paths | undefined): boolean {
  if (!a || !b) return a === b;
  return sameSet(a.names, b.names) && sameSet(a.packages, b.packages);
}

export class DrizzleFiles {
  // Your files that name one of Drizzle's packages.
  private readonly naming = new Set<string>();
  // Your other files that export something, with their quoted paths. One that
  // imports a file that uses Drizzle can pass Drizzle's values along, like
  // `export { db } from './db'`.
  private readonly exporting = new Map<string, Paths>();
  // The files that use Drizzle: those that name it, and those that pass its
  // values along. Worked out again by settle() after every change.
  private using = new Set<string>();
  // What an import path can end with, or start with, to lead to one of them.
  private names = new Set<string>();
  private packages = new Set<string>();
  private pattern: RegExp | null = null;

  // The name of the package each file belongs to, like `@repo/db`, which other
  // packages of a monorepo import it by. Read once per file.
  private readonly packageName: (fileName: string) => string | undefined;
  private readonly packageNames = new Map<string, string | undefined>();

  constructor(packageName: (fileName: string) => string | undefined = () => undefined) {
    this.packageName = packageName;
  }

  // Notes a file's latest text. Returns true when the set of files that use
  // Drizzle changed, which can change the marks of other files.
  update(fileName: string, text: string): boolean {
    if (!CODE_EXTENSION.test(fileName)) return false;
    const names = text.includes('drizzle-');
    const paths = !names && /\bexport\b/.test(text) ? pathsIn(text) : undefined;
    if (names === this.naming.has(fileName) && samePaths(paths, this.exporting.get(fileName))) return false;
    const used = this.using.has(fileName);
    this.note(fileName, names, paths);
    // Most edits are to a file that doesn't use Drizzle and still can't, which
    // changes nothing for the other files.
    if (!used && !names && !(paths && this.leadsToUse(paths))) return false;
    return this.settle();
  }

  remove(fileName: string): boolean {
    const used = this.using.has(fileName);
    this.note(fileName, false, undefined);
    this.packageNames.delete(fileName);
    return used && this.settle();
  }

  // Notes many files at once, as when the extension starts.
  addAll(entries: Iterable<[string, string]>) {
    for (const [fileName, text] of entries) {
      if (!CODE_EXTENSION.test(fileName)) continue;
      const names = text.includes('drizzle-');
      this.note(fileName, names, !names && /\bexport\b/.test(text) ? pathsIn(text) : undefined);
    }
    this.settle();
  }

  // A package.json changed, so a package may have a new name.
  forgetPackageNames() {
    this.packageNames.clear();
    this.settle();
  }

  has(fileName: string): boolean {
    return this.using.has(fileName);
  }

  // One text search: does this text name Drizzle, or import a file of yours
  // that uses it? Only then can it get a mark.
  mightUse(text: string): boolean {
    if (!this.pattern) {
      const alternatives = ['drizzle-'];
      if (this.names.size) {
        const names = [...this.names].map(escape).join('|');
        alternatives.push(`['"\`](?:[^'"\`\\n]*\\/)?[#~$]?(?:${names})(?:\\.[cm]?[jt]sx?)?(?:\\/index(?:\\.[cm]?[jt]sx?)?)?['"\`]`);
      }
      if (this.packages.size) {
        const packages = [...this.packages].map(escape).join('|');
        alternatives.push(`['"\`](?:${packages})(?:\\/[^'"\`\\n]*)?['"\`]`);
      }
      this.pattern = new RegExp(alternatives.join('|'));
    }
    return this.pattern.test(text);
  }

  private note(fileName: string, names: boolean, paths: Paths | undefined) {
    if (names) this.naming.add(fileName);
    else this.naming.delete(fileName);
    if (paths) this.exporting.set(fileName, paths);
    else this.exporting.delete(fileName);
  }

  // Works out which files use Drizzle: the files that name it, then the files
  // that pass its values along, until no more are found. A chain of files that
  // pass `db` along can start using Drizzle at any time, as when the file at
  // its end gets its first Drizzle import. Returns true when the set changed.
  private settle(): boolean {
    const before = this.using;
    this.using = new Set();
    this.names = new Set();
    this.packages = new Set();
    for (const fileName of this.naming) this.use(fileName);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [fileName, paths] of this.exporting) {
        if (this.using.has(fileName) || !this.leadsToUse(paths)) continue;
        this.use(fileName);
        grew = true;
      }
    }
    this.pattern = null;
    return !sameSet(before, this.using);
  }

  private use(fileName: string) {
    this.using.add(fileName);
    this.names.add(importName(fileName));
    if (!this.packageNames.has(fileName)) this.packageNames.set(fileName, this.packageName(fileName));
    const name = this.packageNames.get(fileName);
    if (name) this.packages.add(name);
  }

  private leadsToUse(paths: Paths): boolean {
    for (const name of paths.names) if (this.names.has(name)) return true;
    for (const name of paths.packages) if (this.packages.has(name)) return true;
    return false;
  }
}
