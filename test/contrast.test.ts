// Runs scripts/contrast.ts as a test: text on a mark keeps 4.5:1 in the
// built-in themes where the default color allows it, the dark and
// high-contrast ones. On Light Modern and Light 2026 their color for types
// drops below that, as the README says, so those are only checked to be found.
// The themes are read from the VS Code install on this machine, so the test is
// skipped where VS Code isn't installed.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { checkThemes, THEMES_FOLDER } from '../scripts/contrast.ts';

const READABLE = ['Dark Modern', 'Dark 2026', 'Dark High Contrast', 'Light High Contrast'];

test('text on a mark stays readable in the dark and high-contrast themes', { skip: !existsSync(THEMES_FOLDER) }, () => {
  const reports = checkThemes();
  for (const theme of [...READABLE, 'Light Modern']) {
    assert.ok(reports.some((report) => report.theme === theme), `${theme} wasn't found`);
  }
  for (const report of reports.filter((item) => READABLE.includes(item.theme))) {
    assert.deepEqual(report.failures, [], `${report.theme}: ${report.failures.join(', ')}`);
  }
});
