// Which of your files use Drizzle, so that any other file costs one text search.
//
// A file uses Drizzle when it names one of Drizzle's packages, like
// `drizzle-orm/pg-core`, or when it imports one of your files that does, like a
// route that imports `db` from `$lib/server/db`. The first is a search for
// `drizzle-`. The second would mean following every import, so instead this
// notes which of your files name Drizzle, and builds one regular expression that
// finds either `drizzle-` or an import path that ends with one of their names.
// A file it doesn't match can't get a mark, so it isn't parsed at all.

import { basename, dirname } from 'node:path';

const CODE_EXTENSION = /\.[cm]?[jt]sx?$/;

// The name an import path ends with for a file: `schema` for schema.ts, and the
// folder's name for an index file, as in `$lib/server/db` for db/index.ts.
function importName(fileName: string): string {
  const stem = basename(fileName).replace(CODE_EXTENSION, '');
  return stem === 'index' ? basename(dirname(fileName)) : stem;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class DrizzleFiles {
  // Your files that use Drizzle, by file name.
  private readonly files = new Set<string>();
  // Your files that don't name Drizzle, with what they say about imports and
  // exports, kept to see whether one starts passing Drizzle's values along.
  private readonly others = new Map<string, { exports: boolean }>();
  private pattern: RegExp | null = null;

  // Notes a file's latest text. Returns true when the set of files that use
  // Drizzle changed, which can change the marks of other files.
  update(fileName: string, text: string): boolean {
    if (!CODE_EXTENSION.test(fileName)) return false;
    const before = this.files.size;
    this.files.delete(fileName);
    this.others.delete(fileName);
    if (text.includes('drizzle-')) this.files.add(fileName);
    else this.others.set(fileName, { exports: /\bexport\b/.test(text) });
    this.pattern = null;
    // A file that exports something and imports one of the files that use
    // Drizzle can pass Drizzle's values along, like `export { db } from './db'`.
    // Those count too, until no more are found.
    if (!this.files.has(fileName) && this.others.get(fileName)!.exports && this.mightUse(text)) {
      this.files.add(fileName);
      this.others.delete(fileName);
      this.pattern = null;
    }
    return this.files.size !== before;
  }

  remove(fileName: string): boolean {
    this.others.delete(fileName);
    const removed = this.files.delete(fileName);
    if (removed) this.pattern = null;
    return removed;
  }

  // Notes many files at once, as when the extension starts, and then the files
  // that pass Drizzle's values along, until no more are found.
  addAll(entries: Iterable<[string, string]>) {
    const exporting = new Map<string, string>();
    for (const [fileName, text] of entries) {
      if (!CODE_EXTENSION.test(fileName)) continue;
      if (text.includes('drizzle-')) this.files.add(fileName);
      else {
        const exports = /\bexport\b/.test(text);
        this.others.set(fileName, { exports });
        if (exports) exporting.set(fileName, text);
      }
    }
    this.pattern = null;
    for (let grew = true; grew; ) {
      grew = false;
      for (const [fileName, text] of exporting) {
        if (!this.mightUse(text)) continue;
        this.files.add(fileName);
        this.others.delete(fileName);
        exporting.delete(fileName);
        this.pattern = null;
        grew = true;
      }
    }
  }

  has(fileName: string): boolean {
    return this.files.has(fileName);
  }

  // One text search: does this text name Drizzle, or import a file of yours
  // that uses it? Only then can it get a mark.
  mightUse(text: string): boolean {
    if (!this.pattern) {
      const names = [...new Set([...this.files].map(importName))].map(escape);
      const imports = names.length
        ? `|['"\`](?:[^'"\`\\n]*\\/)?[#~]?(?:${names.join('|')})(?:\\.[cm]?[jt]sx?)?(?:\\/index(?:\\.[cm]?[jt]sx?)?)?['"\`]`
        : '';
      this.pattern = new RegExp(`drizzle-${imports}`);
    }
    return this.pattern.test(text);
  }
}
