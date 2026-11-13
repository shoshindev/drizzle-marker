// The VS Code side of the extension: it decides when to repaint, and draws the
// marks that findMarks.ts finds.

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { DrizzleFiles } from './drizzleFiles.ts';
import { findMarks, type Context, type Result } from './findMarks.ts';
import { importReader, packageNameOf, usesDrizzle } from './imports.ts';
import { MarkMemory } from './markMemory.ts';

// The kinds of file that can hold Drizzle code.
const LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

// A color people can change in their settings. Its defaults are in package.json:
// teal, #14B8A6, plus two digits for the opacity. 2E is 18% and 42 is 26%, which
// the dark high-contrast theme gets, since its black background needs more.
const MARKER_COLOR = new vscode.ThemeColor('drizzleMarker.background');

// How long to wait after a keystroke before repainting.
const TYPING_PAUSE_MS = 150;

// Your code files, and the folders that hold builds, dependencies and tools'
// copies of your code, which are left out.
const CODE_FILES = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SKIPPED_FOLDERS = '**/{node_modules,dist,build,out,coverage,.git,.svelte-kit,.next,.nuxt,.output,.vercel,.turbo}/**';
const SKIPPED_PATH = /[\\/](node_modules|dist|build|out|coverage|\.git|\.svelte-kit|\.next|\.nuxt|\.output|\.vercel|\.turbo)[\\/]/;
const MAX_FILES = 20_000;

const NO_MARKS: Result = { marks: [], complete: true };

// VS Code calls this once, the first time a file in one of those languages opens.
export function activate(context: vscode.ExtensionContext) {
  // Where the extension notes how long its work takes, in the Output panel.
  const log = vscode.window.createOutputChannel('Drizzle Marker', { log: true });

  // A decoration type is a reusable style for overlays on the text. It sets a
  // background only, so the theme's text colors stay as they are.
  const marker = vscode.window.createTextEditorDecorationType({
    borderRadius: '3px',
    backgroundColor: MARKER_COLOR,
    // Stops a mark from stretching when you type right at its edge.
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  // On or off. globalState survives restarting VS Code.
  let enabled = context.globalState.get('enabled', true);

  const memory = new MarkMemory();

  // Your files that use Drizzle. Until they've all been read, any file in a
  // project that uses Drizzle might use it too.
  const drizzleFiles = new DrizzleFiles(packageNameOf);
  let scanned = false;

  // Files open in the editor count with their unsaved changes, when another
  // file reads them, like a route reading the `db` in $lib/server/db.ts.
  const readImport = importReader((fileName) => {
    const document = vscode.workspace.textDocuments.find(
      (item) => item.uri.scheme === 'file' && item.uri.fsPath === fileName,
    );
    return document ? { text: document.getText(), version: document.version } : undefined;
  });

  // Whether each project uses Drizzle, by its folder, until a package.json changes.
  const projects = new Map<string, boolean>();
  function inDrizzleProject(fileName: string): boolean {
    const folder = dirname(fileName);
    let drizzle = projects.get(folder);
    if (drizzle === undefined) {
      drizzle = usesDrizzle(fileName);
      projects.set(folder, drizzle);
    }
    return drizzle;
  }

  function marksFor(document: vscode.TextDocument): Result {
    const text = document.getText();
    const options = {
      // A .ts file can't hold JSX, and there `<T>(x) => x` is a generic function.
      jsx: document.languageId !== 'typescript',
      dts: /\.d\.[cm]?ts$/.test(document.fileName),
    };
    if (document.uri.scheme !== 'file' || !inDrizzleProject(document.uri.fsPath)) {
      // Only a project that uses Drizzle has files that use it without naming it.
      return text.includes('drizzle-') ? findMarks(text, options) : NO_MARKS;
    }
    // One text search rules out a file that neither names Drizzle nor imports
    // one of your files that does, like most of your components and helpers.
    if (scanned && !drizzleFiles.mightUse(text)) return NO_MARKS;
    return findMarks(text, options, { fileName: document.uri.fsPath, readImport } satisfies Context);
  }

  let typingTimer: NodeJS.Timeout | undefined;

  // The version of each file whose marks couldn't be found because of a bug in
  // the marker, so the error is logged once, not on every repaint.
  const failedVersions = new Map<string, number>();

  function paint(editor: vscode.TextEditor, afterEdit: boolean) {
    const { document } = editor;
    if (!LANGUAGES.includes(document.languageId)) return;

    if (!enabled) {
      editor.setDecorations(marker, []);
      return;
    }

    const key = document.uri.toString();
    const started = performance.now();
    let result: Result;
    try {
      result = marksFor(document);
    } catch (error) {
      // The other editors still get painted, and this one keeps its last good
      // marks, as when its code is half-typed.
      if (failedVersions.get(key) !== document.version) {
        failedVersions.set(key, document.version);
        log.error(`Couldn't find the marks in ${document.fileName}: ${error instanceof Error ? error.stack : error}`);
      }
      result = { marks: [], complete: false };
    }
    log.trace(`Found ${result.marks.length} marks in ${document.fileName} in ${(performance.now() - started).toFixed(1)} ms`);
    const marks = memory.marksToPaint(key, result, afterEdit);
    if (!marks) return;
    const ranges = marks.map(
      (mark) => new vscode.Range(document.positionAt(mark.start), document.positionAt(mark.end)),
    );
    editor.setDecorations(marker, ranges);
  }

  function paintVisibleEditors(afterEdit: boolean) {
    for (const editor of vscode.window.visibleTextEditors) paint(editor, afterEdit);
  }

  async function toggle() {
    enabled = !enabled;
    await context.globalState.update('enabled', enabled);
    paintVisibleEditors(false);
    vscode.window.setStatusBarMessage(`Drizzle Marker: ${enabled ? 'on' : 'off'}`, 2000);
  }

  // Reads your code files once, in the background, to note which use Drizzle.
  async function scan() {
    const started = performance.now();
    const uris = await vscode.workspace.findFiles(CODE_FILES, SKIPPED_FOLDERS, MAX_FILES);
    const entries: [string, string][] = [];
    for (const uri of uris) {
      if (uri.scheme !== 'file') continue;
      try {
        entries.push([uri.fsPath, await readFile(uri.fsPath, 'utf8')]);
      } catch {
        // A file that's gone or can't be read can't hold marks.
      }
    }
    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === 'file') entries.push([document.uri.fsPath, document.getText()]);
    }
    drizzleFiles.addAll(entries);
    scanned = true;
    log.info(`Read ${uris.length} files to find the ones that use Drizzle, in ${Math.round(performance.now() - started)} ms`);
    paintVisibleEditors(false);
  }

  // Notes a file changed outside the editor, like after `git pull`.
  async function reread(uri: vscode.Uri) {
    if (uri.scheme !== 'file' || SKIPPED_PATH.test(uri.fsPath)) return;
    if (vscode.workspace.textDocuments.some((document) => document.uri.toString() === uri.toString())) return;
    try {
      if (drizzleFiles.update(uri.fsPath, await readFile(uri.fsPath, 'utf8'))) paintVisibleEditors(false);
    } catch {
      if (drizzleFiles.remove(uri.fsPath)) paintVisibleEditors(false);
    }
  }

  // A package.json can add or remove Drizzle, or rename one of your packages.
  const packageFiles = vscode.workspace.createFileSystemWatcher('**/package.json');
  const forgetProjects = () => {
    projects.clear();
    drizzleFiles.forgetPackageNames();
    paintVisibleEditors(false);
  };
  const codeFiles = vscode.workspace.createFileSystemWatcher(CODE_FILES);

  // Everything in this list is cleaned up when the extension shuts down.
  context.subscriptions.push(
    log,
    marker,
    packageFiles,
    packageFiles.onDidCreate(forgetProjects),
    packageFiles.onDidChange(forgetProjects),
    packageFiles.onDidDelete(forgetProjects),
    codeFiles,
    codeFiles.onDidCreate(reread),
    codeFiles.onDidChange(reread),
    codeFiles.onDidDelete((uri) => {
      if (drizzleFiles.remove(uri.fsPath)) paintVisibleEditors(false);
    }),
    vscode.commands.registerCommand('drizzleMarker.toggle', toggle),

    // A tab was opened or shown, or an editor was split.
    vscode.window.onDidChangeVisibleTextEditors(() => paintVisibleEditors(false)),

    // Wait for a pause in typing, so we don't reparse on every keystroke. Every
    // visible editor repaints, since a change to your schema can change the
    // marks in a file that uses it.
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!LANGUAGES.includes(event.document.languageId)) return;
      if (event.contentChanges.length === 0) return;
      if (event.document.uri.scheme === 'file') drizzleFiles.update(event.document.uri.fsPath, event.document.getText());
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => paintVisibleEditors(true), TYPING_PAUSE_MS);
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      memory.forget(document.uri.toString());
      failedVersions.delete(document.uri.toString());
    }),
  );

  paintVisibleEditors(false);
  scan().catch((error) => {
    // Without the list, every file in a project that uses Drizzle is read, as
    // before the scan. Marks stay right, only a little more work is done.
    log.error(`Couldn't read your files: ${error}`);
  });
}
