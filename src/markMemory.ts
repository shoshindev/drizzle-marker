// Decides which marks to paint when a file can't be parsed, which happens all
// the time while you type. This file knows nothing about VS Code, so
// test/markMemory.test.ts can check it.

import type { Mark, Result } from './findMarks.ts';

export class MarkMemory {
  // Each file's last complete set of marks. VS Code drops a tab's decorations
  // when it's hidden, so these are needed if it comes back with broken code.
  private readonly lastGood = new Map<string, Mark[]>();

  // The marks to paint for a file, or undefined to leave the painted ones as
  // they are. `afterEdit` is true when the file just changed under your typing.
  marksToPaint(key: string, result: Result, afterEdit: boolean): Mark[] | undefined {
    if (result.complete) {
      this.lastGood.set(key, result.marks);
      return result.marks;
    }
    const last = this.lastGood.get(key);
    // Mid-typing the code is often half-written. Leave the marks alone: VS Code
    // moves them along with your edits, and they catch up once the code is valid.
    if (afterEdit && last) return undefined;
    // A tab shown again repaints with the last good marks. A file that has never
    // parsed whole has nothing better than what did parse.
    return last ?? result.marks;
  }

  forget(key: string) {
    this.lastGood.delete(key);
  }
}
