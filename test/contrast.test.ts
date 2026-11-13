// Runs scripts/contrast.ts as a test: text on top of a mark keeps 4.5:1 in
// VS Code's own themes. It reads them from the VS Code install on this machine,
// so it's skipped where VS Code isn't installed.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { checkThemes, THEMES_FOLDER } from '../scripts/contrast.ts';

test('text on a mark stays readable in Light Modern, Dark Modern and the high-contrast themes', { skip: !existsSync(THEMES_FOLDER) }, () => {
  const reports = checkThemes();
  for (const theme of ['Dark Modern', 'Light Modern', 'Dark High Contrast', 'Light High Contrast']) {
    assert.ok(reports.some((report) => report.theme === theme), `${theme} wasn't found`);
  }
  for (const report of reports) {
    assert.deepEqual(report.failures, [], `${report.theme}: ${report.failures.join(', ')}`);
  }
});
