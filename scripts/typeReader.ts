// Reads the types that Drizzle's packages publish, for scripts/generateShapes.ts
// and test/shapes.test.ts. TypeScript 7, which checks this project, has no API
// for reading types yet, so this uses TypeScript 6.
//
// Both the current release and the 1.0 release candidate are read, installed as
// drizzle-orm and drizzle-orm-1, so names from either one get marks.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-6';

export { ts };

const NODE_MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));

// Each installed package, and the name your code imports it by.
const PACKAGES = [
  ['drizzle-orm', 'drizzle-orm'],
  ['drizzle-orm-1', 'drizzle-orm'],
  ['drizzle-kit', 'drizzle-kit'],
  ['drizzle-kit-1', 'drizzle-kit'],
  ['drizzle-zod', 'drizzle-zod'],
  ['drizzle-valibot', 'drizzle-valibot'],
  ['drizzle-typebox', 'drizzle-typebox'],
  ['drizzle-arktype', 'drizzle-arktype'],
  ['drizzle-seed', 'drizzle-seed'],
] as const;

// Subpaths that run the CLI or hold its internal data, which no one imports.
const SKIPPED_SUBPATHS = /^\.\/(cli|payload\/)/;

// The version of each package read, as installed.
export function packageVersions(): [string, string][] {
  return PACKAGES.map(([folder]) => [
    folder,
    JSON.parse(readFileSync(`${NODE_MODULES}${folder}/package.json`, 'utf8')).version,
  ]);
}

export interface ModuleFile {
  // The path your code imports, like drizzle-orm/pg-core.
  path: string;
  // The type file that path leads to.
  file: string;
}

function typesOf(target: any): string | undefined {
  if (typeof target === 'string') return target.endsWith('.d.ts') || target.endsWith('.d.mts') ? target : undefined;
  return target?.import?.types ?? target?.types ?? target?.require?.types;
}

// The modules of every package: the ones its package.json lists, and for a
// package that lists `./*`, each type file at its top level plus the migrators.
export function moduleFiles(): ModuleFile[] {
  const modules: ModuleFile[] = [];
  for (const [folder, name] of PACKAGES) {
    const root = `${NODE_MODULES}${folder}/`;
    const { exports } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
    for (const [subpath, target] of Object.entries<any>(exports)) {
      if (subpath.endsWith('.json') || SKIPPED_SUBPATHS.test(subpath)) continue;
      const path = subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
      if (subpath === './*') {
        for (const entry of readdirSync(root)) {
          if (!entry.endsWith('.d.ts') || entry === 'index.d.ts') continue;
          const module = entry.slice(0, -'.d.ts'.length);
          modules.push({ path: `${name}/${module}`, file: `${root}${entry}` });
          const migrator = `${root}${module}/migrator.d.ts`;
          if (existsSync(migrator)) modules.push({ path: `${name}/${module}/migrator`, file: migrator });
        }
        continue;
      }
      // Of the many deep paths the current release lists, only these are written
      // by hand: a top-level module, a driver's migrator, and the AWS driver.
      if (subpath.split('/').length > 2 && !/\/migrator$|^\.\/aws-data-api\/pg$/.test(subpath)) continue;
      const types = typesOf(target);
      if (types) modules.push({ path, file: `${root}${types.slice(2)}` });
    }
  }
  return modules;
}

export const MODULE_FILES = moduleFiles();

export const program = ts.createProgram(
  MODULE_FILES.map((module) => module.file),
  {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
  },
);
export const checker = program.getTypeChecker();

// Is this one of the files of Drizzle's packages?
export function isDrizzleFile(fileName: string): boolean {
  return /node_modules\/drizzle-(orm|kit|zod|valibot|typebox|arktype|seed)(-1)?\//.test(fileName);
}

// `prototype` and the methods every object or promise has are plain JS. `#private`,
// names with a leading `__`, and symbol keys are bookkeeping that no one writes.
const PLAIN_JS_NAMES = new Set(['prototype', 'constructor', 'toString', 'valueOf', 'then', 'catch', 'finally']);

export function isWrittenName(name: string): boolean {
  return !PLAIN_JS_NAMES.has(name) && !name.startsWith('#') && !name.startsWith('__');
}

// A private or protected member, which only Drizzle's own code can use.
function isHidden(symbol: ts.Symbol): boolean {
  return Boolean(
    symbol.declarations?.some(
      (declaration) => ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected),
    ),
  );
}

// The members of a type that Drizzle's own type files declare.
export function drizzleMembers(type: ts.Type): ts.Symbol[] {
  return safely(() => checker.getPropertiesOfType(type), [])
    .filter((item) => isWrittenName(item.name) && !isHidden(item))
    .filter((item) => item.declarations?.some((declaration) => isDrizzleFile(declaration.getSourceFile().fileName)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The exported values and types of a module, by the path your code imports.
export function moduleExports(): Map<string, Map<string, ts.Symbol[]>> {
  const modules = new Map<string, Map<string, ts.Symbol[]>>();
  for (const { path, file } of MODULE_FILES) {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    const exports = modules.get(path) ?? new Map<string, ts.Symbol[]>();
    for (const item of checker.getExportsOfModule(module)) {
      const symbol = item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
      exports.set(item.name, [...(exports.get(item.name) ?? []), symbol]);
    }
    modules.set(path, exports);
  }
  return new Map([...modules].sort(([a], [b]) => a.localeCompare(b)));
}

// Something to sort the kinds of a union by that stays the same from run to run:
// the text of a string, or where its type is declared. Printing the whole type
// would be clearer, but some of Drizzle's types are too deep to print.
function sortKey(type: ts.Type): string {
  if (type.isStringLiteral()) return `'${type.value}'`;
  const declaration = type.getSymbol()?.declarations?.[0] ?? type.aliasSymbol?.declarations?.[0];
  if (!declaration) return `~${type.flags}`;
  return `${declaration.getSourceFile().fileName.replace(/^.*node_modules\//, '')}:${declaration.pos}`;
}

// What TypeScript knows a generic type is at least: `T extends Column` counts as
// a Column, and `A extends B ? C : D` as either C or D.
function constraintOf(type: ts.Type): ts.Type | undefined {
  const constraint = safely(() => checker.getBaseConstraintOfType(type), undefined);
  if (!constraint || constraint === type || constraint.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return;
  return constraint;
}

export function isGeneric(type: ts.Type): boolean {
  return Boolean(type.flags & GENERIC);
}

const GENERIC =
  ts.TypeFlags.TypeParameter |
  ts.TypeFlags.IndexedAccess |
  ts.TypeFlags.Conditional |
  ts.TypeFlags.Substitution |
  ts.TypeFlags.Index;

// Runs a question past TypeScript, or gives up on it. A few of Drizzle's types
// are nested so deep that TypeScript itself runs out of stack on them.
export function safely<T>(question: () => T, fallback: T): T {
  try {
    return question();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    givenUp++;
    return fallback;
  }
}

// How many questions TypeScript ran out of stack on. Each one can leave a shape
// without some of its members, so the generator reports the count.
export let givenUp = 0;

// What a promise or a query holds once awaited: the first parameter of the
// callback its `then` takes. TypeScript's own getAwaitedType compares the type
// with Promise, which runs out of stack on some of Drizzle's types.
function promisedType(type: ts.Type): ts.Type | undefined {
  return safely(() => {
    const then = checker.getPropertyOfType(type, 'then');
    if (!then) return undefined;
    const onFulfilled = checker.getTypeOfSymbol(then).getCallSignatures()[0]?.getParameters()[0];
    if (!onFulfilled) return undefined;
    const callback = checker.getNonNullableType(checker.getTypeOfSymbol(onFulfilled));
    for (const kind of callback.isUnion() ? callback.types : [callback]) {
      const value = kind.getCallSignatures()[0]?.getParameters()[0];
      if (value) return checker.getTypeOfSymbol(value);
    }
    return undefined;
  }, undefined);
}

// What a value of this type can be: a promise counts as what it holds, a union
// as each of its kinds, and a generic type as what it's constrained to. A promise
// with names of its own, like a query, counts as itself too. TypeScript orders a
// union by when it first met each kind, which changes with what was read before,
// so they're sorted by name.
export function kindsOf(type: ts.Type, seen = new Set<ts.Type>()): ts.Type[] {
  if (seen.has(type)) return [];
  seen.add(type);
  if (type.flags & GENERIC) {
    const constraint = constraintOf(type);
    return constraint ? kindsOf(constraint, seen) : [];
  }
  const awaited = promisedType(type);
  if (awaited && awaited !== type && !(awaited.flags & ts.TypeFlags.Any)) {
    return [...(drizzleMembers(type).length > 0 ? [type] : []), ...kindsOf(awaited, seen)];
  }
  if (!type.isUnion()) return [type];
  return [...type.types].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).flatMap((kind) => kindsOf(kind, seen));
}

// Can one of these kinds be any string at all, as a table's name can? Then none
// of the strings at that place are fixed.
export function allowsAnyString(kinds: readonly ts.Type[]): boolean {
  const anyString = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping;
  return kinds.some((kind) => Boolean(kind.flags & anyString));
}

// The strings the values of these types can only be, like 'cascade' and 'restrict'.
export function fixedValues(types: readonly ts.Type[]): string[] {
  const kinds = types.flatMap((type) => kindsOf(type));
  if (allowsAnyString(kinds)) return [];
  const strings = kinds.filter((kind) => kind.isStringLiteral());
  return [...new Set(strings.map((kind) => (kind as ts.StringLiteralType).value))].sort();
}

export function isArray(type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

export function itemTypes(type: ts.Type): readonly ts.Type[] {
  return checker.getTypeArguments(type as ts.TypeReference);
}

// A mapped type over keys TypeScript doesn't know yet, like the columns of a
// table: `{ [Key in keyof TColumns]: ... }`. The keys are yours.
export function isGenericMapped(type: ts.Type): boolean {
  return (
    Boolean((type as any).objectFlags & ts.ObjectFlags.Mapped) &&
    checker.getPropertiesOfType(type).length === 0 &&
    checker.getIndexInfosOfType(type).length === 0
  );
}

// What each value of such a mapped type holds.
export function mappedValueType(type: ts.Type): ts.Type | undefined {
  const node: ts.TypeNode | undefined = (type as any).declaration?.type;
  return node ? checker.getTypeFromTypeNode(node) : undefined;
}

// A type with members or call signatures.
export function isObject(type: ts.Type): boolean {
  if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) return true;
  return false;
}

export function signaturesOf(type: ts.Type): readonly ts.Signature[] {
  return [...type.getCallSignatures(), ...type.getConstructSignatures()];
}

// The types of each argument of a signature. A rest parameter typed as a list of
// tuples, like `...params: [string] | [string, Config]`, counts as one argument
// per place in the tuples.
export function argumentTypes(signature: ts.Signature): ts.Type[][] {
  const args: ts.Type[][] = [];
  for (const parameter of signature.getParameters()) {
    const type = checker.getTypeOfSymbol(parameter);
    const declaration = parameter.valueDeclaration as ts.ParameterDeclaration | undefined;
    if (!declaration?.dotDotDotToken) {
      args.push([type]);
      continue;
    }
    const start = args.length;
    for (const kind of kindsOf(type)) {
      if (checker.isTupleType(kind)) {
        itemTypes(kind).forEach((item, index) => (args[start + index] ??= []).push(item));
      } else if (checker.isArrayType(kind)) {
        // `...values: SQL[]`: every argument from here on is one.
        (args[start] ??= []).push(...itemTypes(kind));
      }
    }
  }
  return args;
}

// Where in Drizzle's types a name is left unmarked, and why. A position reads
// like `drizzle-orm/pg-core:pgTable(0)`, for the first argument of pgTable().
export const LEFT_OUT: [RegExp, string][] = [];

export function isLeftOut(position: string): boolean {
  return LEFT_OUT.some(([pattern]) => pattern.test(position));
}
