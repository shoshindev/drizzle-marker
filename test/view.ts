// Shows a file's marks in its text, as ⟦this⟧, so a whole file's marks can be
// read at a glance and compared with the expected ones in test/corpus.

import type { Mark } from '../src/findMarks.ts';

export const OPEN = '⟦';
export const CLOSE = '⟧';

export function showMarks(text: string, marks: Mark[]): string {
  let result = '';
  let at = 0;
  for (const mark of marks) {
    if (mark.start < at) continue;
    result += text.slice(at, mark.start) + OPEN + text.slice(mark.start, mark.end) + CLOSE;
    at = mark.end;
  }
  return result + text.slice(at);
}

// The marks written into a text as ⟦this⟧, and the text without them.
export function readMarks(view: string): { text: string; marks: Mark[] } {
  const marks: Mark[] = [];
  let text = '';
  let start = -1;
  for (const char of view) {
    if (char === OPEN) start = text.length;
    else if (char === CLOSE) {
      marks.push({ start, end: text.length });
      start = -1;
    } else text += char;
  }
  return { text, marks };
}
