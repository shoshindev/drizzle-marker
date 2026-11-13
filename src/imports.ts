// Finds the file an import path leads to, so findMarks.ts can read what you
// export there, like the `db` in `import { db } from '$lib/server/db'`.
//
// It follows the ways a project names its own files: relative paths, `#lib/...`
// from the `imports` in package.json, `paths` in tsconfig.json or jsconfig.json,
// SvelteKit's `$lib`, and the packages of your own monorepo, like `@repo/db`.
// Packages you install, like `postgres`, aren't followed.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ImportedFile } from './findMarks.ts';

// Files that hold code findMarks.ts can read.
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

// TypeScript lets `./db.js` stand for `./db.ts`, and so on.
const SOURCE_FOR: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

// The text of a file that's open in the editor, which may not be saved yet.
export type OpenFiles = (fileName: string) => { text: string; version: number } | undefined;

interface Cached<T> {
  stamp: string;
  value: T;
}

function stampOf(fileName: string): string | undefined {
  try {
    const stats = statSync(fileName);
    return stats.isFile() ? `${stats.mtimeMs}:${stats.size}` : undefined;
  } catch {
    return undefined;
  }
}

// Reads a JSON file, or a tsconfig.json with comments and trailing commas,
// again only when it changes.
const jsonFiles = new Map<string, Cached<any>>();

function readJson(fileName: string): any {
  const stamp = stampOf(fileName);
  if (!stamp) return undefined;
  const cached = jsonFiles.get(fileName);
  if (cached?.stamp === stamp) return cached.value;
  let value: any;
  try {
    value = JSON.parse(withoutComments(readFileSync(fileName, 'utf8')));
  } catch {
    value = undefined;
  }
  jsonFiles.set(fileName, { stamp, value });
  return value;
}

// Removes comments and trailing commas, which tsconfig.json allows and JSON
// doesn't. Strings are kept as they are, since `"@/*"` looks like a comment.
export function withoutComments(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      for (index++; index < text.length && text[index] !== '"'; index++) if (text[index] === '\\') index++;
      result += text.slice(start, index + 1);
    } else if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      result += '\n';
    } else if (char === '/' && text[index + 1] === '*') {
      index = text.indexOf('*/', index + 2);
      if (index < 0) break;
      index++;
    } else {
      result += char;
    }
  }
  return result.replace(/,(\s*[}\]])/g, '$1');
}

// The nearest file with this name in the folder or above it.
function nearest(folder: string, name: string): string | undefined {
  for (let current = folder; ; current = dirname(current)) {
    const candidate = join(current, name);
    if (stampOf(candidate)) return candidate;
    if (dirname(current) === current) return undefined;
  }
}

// Matches a path against a pattern like `#lib/*` or `@/*`, and returns what the
// `*` stood for, or undefined.
function matchPattern(pattern: string, path: string): string | undefined {
  const star = pattern.indexOf('*');
  if (star < 0) return pattern === path ? '' : undefined;
  const before = pattern.slice(0, star);
  const after = pattern.slice(star + 1);
  if (path.length < before.length + after.length || !path.startsWith(before) || !path.endsWith(after)) return undefined;
  return path.slice(before.length, path.length - after.length);
}

// The files a target in package.json can stand for, most likely first. A target
// may be a set of conditions, like `{ "types": "./a.ts", "default": "./a.js" }`,
// and the types often point at the source in a monorepo's own packages.
function conditionTargets(target: any): string[] {
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.flatMap(conditionTargets);
  if (target && typeof target === 'object') {
    return ['types', 'import', 'node', 'default', 'require'].flatMap((condition) => conditionTargets(target[condition]));
  }
  return [];
}

// The files a path stands for in a map like the `imports` or `exports` of a
// package.json, relative to its folder. The longest pattern that matches wins,
// as Node picks it.
function mapped(map: Record<string, any>, path: string, folder: string): string[] | undefined {
  const patterns = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    const rest = matchPattern(pattern, path);
    if (rest === undefined) continue;
    return conditionTargets(map[pattern]).map((target) => resolve(folder, target.replaceAll('*', rest)));
  }
  return undefined;
}

// `#lib/server/db.js` through `"imports": { "#lib/*": "./src/lib/*" }`.
function fromPackageImports(path: string, fromFile: string): string[] {
  const packageFile = nearest(dirname(fromFile), 'package.json');
  const imports = packageFile ? readJson(packageFile)?.imports : undefined;
  if (!packageFile || !imports || typeof imports !== 'object') return [];
  return mapped(imports, path, dirname(packageFile)) ?? [];
}

interface PathOptions {
  base: string;
  paths: Record<string, string[]>;
}

// The `paths` a tsconfig.json or jsconfig.json sets, following `extends`.
function pathOptions(configFile: string, seen = new Set<string>()): PathOptions | undefined {
  if (seen.has(configFile)) return undefined;
  seen.add(configFile);
  const config = readJson(configFile);
  if (!config) return undefined;
  const folder = dirname(configFile);
  const options = config.compilerOptions ?? {};
  if (options.paths) {
    return { base: options.baseUrl ? resolve(folder, options.baseUrl) : folder, paths: options.paths };
  }
  for (const parent of [config.extends].flat()) {
    if (typeof parent !== 'string' || !parent.startsWith('.')) continue;
    const parentFile = resolve(folder, parent.endsWith('.json') ? parent : `${parent}.json`);
    const found = pathOptions(parentFile, seen);
    if (found) return found;
  }
  return undefined;
}

// `@/db` through `"paths": { "@/*": ["./src/*"] }`.
function fromConfigPaths(path: string, fromFile: string): string[] {
  const configFile = nearest(dirname(fromFile), 'tsconfig.json') ?? nearest(dirname(fromFile), 'jsconfig.json');
  const options = configFile ? pathOptions(configFile) : undefined;
  if (!options) return [];
  const patterns = Object.keys(options.paths).sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    const rest = matchPattern(pattern, path);
    if (rest === undefined) continue;
    return options.paths[pattern].map((target) => resolve(options.base, target.replace('*', rest)));
  }
  return [];
}

// SvelteKit's `$lib`, which points at src/lib unless svelte.config.js says
// otherwise. The generated tsconfig that says so may not exist yet.
function fromSvelteKitLib(path: string, fromFile: string): string[] {
  const rest = path === '$lib' ? '' : path.startsWith('$lib/') ? path.slice(4) : undefined;
  if (rest === undefined) return [];
  const packageFile = nearest(dirname(fromFile), 'package.json');
  return packageFile ? [join(dirname(packageFile), 'src/lib', rest)] : [];
}

// The folder of a package of your own monorepo, like packages/db for `@repo/db`.
// Node finds a package in a node_modules folder next to the file or above it,
// and a package manager links your own packages there. A package whose real
// folder is inside node_modules is one you installed, so it isn't followed.
function workspacePackage(name: string, fromFolder: string): string | undefined {
  for (let current = fromFolder; ; current = dirname(current)) {
    const folder = join(current, 'node_modules', name);
    if (stampOf(join(folder, 'package.json'))) {
      try {
        const real = realpathSync(folder);
        return /[\\/]node_modules[\\/]/.test(real) ? undefined : real;
      } catch {
        return undefined;
      }
    }
    if (dirname(current) === current) return undefined;
  }
}

// `@repo/db` and `@repo/db/schema`, through the `exports` of the package's
// package.json, or its `types`, `module` or `main`.
function fromWorkspacePackage(path: string, fromFile: string): string[] {
  const parts = path.split('/');
  const nameLength = path.startsWith('@') ? 2 : 1;
  if (parts.length < nameLength || parts.slice(0, nameLength).some((part) => !part)) return [];
  const folder = workspacePackage(parts.slice(0, nameLength).join('/'), dirname(fromFile));
  if (!folder) return [];
  const subpath = parts.slice(nameLength).join('/');
  const manifest = readJson(join(folder, 'package.json')) ?? {};
  const { exports } = manifest;
  if (exports !== undefined && exports !== null) {
    // `"exports": "./src/index.ts"` and a set of conditions stand for the package itself.
    const map =
      typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith('.'))
        ? exports
        : { '.': exports };
    return mapped(map, subpath ? `./${subpath}` : '.', folder) ?? [];
  }
  if (subpath) return [join(folder, subpath)];
  const entries = [manifest.types, manifest.module, manifest.main].filter((entry) => typeof entry === 'string');
  return [...entries, 'index'].map((entry) => resolve(folder, entry));
}

// The places an import path can point at, before trying file extensions.
function candidates(path: string, fromFile: string): string[] {
  if (path.startsWith('./') || path.startsWith('../') || path === '.' || path === '..') {
    return [resolve(dirname(fromFile), path)];
  }
  if (path.startsWith('/')) return [path];
  if (path.startsWith('#')) return fromPackageImports(path, fromFile);
  return [
    ...fromConfigPaths(path, fromFile),
    ...fromSvelteKitLib(path, fromFile),
    ...fromWorkspacePackage(path, fromFile),
  ];
}

// The code file a place stands for: itself, its .ts twin, or the file with an
// extension added, or the index file of the folder.
function codeFile(place: string, exists: (fileName: string) => boolean): string | undefined {
  const extension = CODE_EXTENSIONS.find((item) => place.endsWith(item));
  if (extension) {
    const stem = place.slice(0, -extension.length);
    for (const twin of SOURCE_FOR[extension] ?? []) if (exists(stem + twin)) return stem + twin;
    if (exists(place) && !place.endsWith('.d.ts')) return place;
  }
  for (const item of CODE_EXTENSIONS) if (exists(place + item)) return place + item;
  for (const item of CODE_EXTENSIONS) if (exists(join(place, `index${item}`))) return join(place, `index${item}`);
  return undefined;
}

// Makes the readImport function findMarks.ts takes. `openFiles` gives the text
// of files open in the editor, so unsaved changes count.
export function importReader(openFiles: OpenFiles = () => undefined) {
  return (path: string, fromFile: string): ImportedFile | null => {
    const exists = (fileName: string) => Boolean(openFiles(fileName)) || Boolean(stampOf(fileName));
    for (const place of candidates(path, fromFile)) {
      const fileName = codeFile(place, exists);
      if (!fileName) continue;
      const open = openFiles(fileName);
      if (open) return { fileName, text: open.text, version: `open:${open.version}` };
      const stamp = stampOf(fileName);
      if (!stamp) continue;
      try {
        return { fileName, text: readFileSync(fileName, 'utf8'), version: stamp };
      } catch {
        return null;
      }
    }
    return null;
  };
}

const DRIZZLE_PACKAGE = /^drizzle-(orm|kit|zod|valibot|typebox|arktype|seed)$/;

// Does the project a file belongs to use Drizzle? Then a file there that never
// names Drizzle can still use it, through an import from a file of yours. A
// project uses it when its package.json lists one of Drizzle's packages, or a
// package of your own monorepo that does, like an app that lists `@repo/db`.
export function usesDrizzle(fromFile: string): boolean {
  const packageFile = nearest(dirname(fromFile), 'package.json');
  return packageFile ? packageUsesDrizzle(packageFile, new Set()) : false;
}

function packageUsesDrizzle(packageFile: string, seen: Set<string>): boolean {
  if (seen.has(packageFile)) return false;
  seen.add(packageFile);
  const manifest = readJson(packageFile);
  if (!manifest) return false;
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies });
  if (names.some((name) => DRIZZLE_PACKAGE.test(name))) return true;
  return names.some((name) => {
    const folder = workspacePackage(name, dirname(packageFile));
    return folder !== undefined && packageUsesDrizzle(join(folder, 'package.json'), seen);
  });
}

// The name of the package a file belongs to, like `@repo/db`, from the nearest
// package.json.
export function packageNameOf(fileName: string): string | undefined {
  const packageFile = nearest(dirname(fileName), 'package.json');
  const name = packageFile ? readJson(packageFile)?.name : undefined;
  return typeof name === 'string' ? name : undefined;
}
