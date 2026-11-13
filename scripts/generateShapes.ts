// Writes src/generatedShapes.json: a shape for every export of Drizzle's
// packages, read from their type files, and test/drizzleExports.txt, the list of
// those exports. Run it after updating any of the packages:
//   npm run shapes
// test/shapes.test.ts fails while either file is out of date.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  allowsAnyString,
  argumentTypes,
  checker,
  drizzleMembers,
  fixedValues,
  givenUp,
  isArray,
  isDrizzleFile,
  isGeneric,
  isGenericMapped,
  isLeftOut,
  isObject,
  itemTypes,
  kindsOf,
  mappedValueType,
  moduleExports,
  packageVersions,
  signaturesOf,
  ts,
} from './typeReader.ts';

export const OUTPUT_FILE = fileURLToPath(new URL('../src/generatedShapes.json', import.meta.url));
export const EXPORTS_FILE = fileURLToPath(new URL('../test/drizzleExports.txt', import.meta.url));

interface Draft {
  members: Map<string, string | null>;
  // Returns the value it's called on, like `notNull()` and `where()`, whose types
  // say they return `this`.
  self: boolean;
  args: (string | null)[];
  returns: string | null;
  items: string | null;
  anyKey: string | null;
  values: string[];
}

// A name like `PgIntegerBuilder` for a type that Drizzle's files declare. Others
// get no name.
function typeName(symbol: ts.Symbol | undefined): string | undefined {
  const declaration = symbol?.declarations?.[0];
  if (!symbol || !declaration || !isDrizzleFile(declaration.getSourceFile().fileName)) return;
  const name = symbol.getName();
  return /^[A-Za-z_$][\w$]*$/.test(name) && !name.startsWith('__') ? name : undefined;
}

// Stops a walk that keeps finding new types, which would otherwise run for hours.
const MAX_SHAPES = 40_000;

// Where a node is written, which tells declarations apart.
function place(node: ts.Node): string {
  return `${node.getSourceFile().fileName.replace(/^.*node_modules\//, '')}:${node.pos}`;
}

// Tells the kinds of value apart by where their type is declared, not by the
// type itself. Each use of a generic type, like `PgSelectBase<'users', ...>`, is a
// type of its own, but its members have the same names, so they share a shape.
// Otherwise the walk would never end, since each method returns a new one.
//
// The parts of a type, like the halves of an intersection, are told apart only
// by where they're declared. Going deeper would recurse so far that TypeScript
// runs out of stack.
function typeKey(type: ts.Type): string {
  if (type.isStringLiteral()) return `'${type.value}'`;
  const parts = (types: readonly ts.Type[]) =>
    [...new Set(types.flatMap((item) => kindsOf(item)).map(placeOfType))].sort().join(',');
  if (type.isIntersection()) return `&(${parts(type.types)})`;
  if (checker.isArrayType(type) || checker.isTupleType(type)) return `[${parts(itemTypes(type))}]`;
  const flags = (type as any).objectFlags ?? 0;
  if (flags & ts.ObjectFlags.Mapped) {
    // Every `Record<string, X>` comes from the one declaration of Record, so a
    // mapped type with a string index is told apart by what its values hold.
    const indexes = checker.getIndexInfosOfType(type);
    if (indexes.length > 0) return `{[key]:${parts(indexes.map((info) => info.type))}}`;
    // A mapped type over keys TypeScript doesn't know yet is told apart by where
    // it's written and the types it was given, like the X in Record<K, X>.
    if (isGenericMapped(type)) return `mapped ${placeOfType(type)}<${parts(type.aliasTypeArguments ?? [])}>`;
    // One whose keys are known, like Omit<PgSelect, 'where'>, by its members.
    const members = checker
      .getPropertiesOfType(type)
      .map((member) => member.declarations?.[0])
      .filter((declaration): declaration is ts.Declaration => Boolean(declaration))
      .map(place);
    return `{${members.sort().join(',')}}`;
  }
  return placeOfType(type);
}

// Where a type is declared, which is all that tells most of Drizzle's types
// apart. A class's instances and the class itself, with its static members,
// share a declaration, so the key says which of the two this is.
function placeOfType(type: ts.Type): string {
  if (type.isStringLiteral()) return `'${type.value}'`;
  if (checker.isArrayType(type) || checker.isTupleType(type)) return '[]';
  const flags = (type as any).objectFlags ?? 0;
  const target = flags & ts.ObjectFlags.Reference ? (type as ts.TypeReference).target : type;
  const declaration =
    (flags & ts.ObjectFlags.Mapped ? (type as any).declaration : undefined) ??
    target.getSymbol()?.declarations?.[0] ??
    type.aliasSymbol?.declarations?.[0];
  const side = flags & (ts.ObjectFlags.ClassOrInterface | ts.ObjectFlags.Reference) ? '' : 'static ';
  return declaration ? `${side}${place(declaration)}` : `#${(type as any).id}`;
}

// Does a method's declared return type mention `this`, as `notNull(): NotNull<this>`
// does? Then calling it gives back the value it was called on, with all its
// members, and not only those of the class that declares the method.
function returnsThis(signature: ts.Signature): boolean {
  return mentionsThis((signature.getDeclaration() as ts.SignatureDeclaration | undefined)?.type);
}

function mentionsThis(node: ts.Node | undefined): boolean {
  let found = false;
  const walk = (child: ts.Node) => {
    if (found) return;
    if (child.kind === ts.SyntaxKind.ThisType) found = true;
    else ts.forEachChild(child, walk);
  };
  if (node) walk(node);
  return found;
}

// A member declared as a function of `this`, like
// `leftJoin: PgSelectJoinFn<this, ...>`. Calling it gives back a query like the
// one it's called on.
function isSelfMember(member: ts.Symbol): boolean {
  return Boolean(
    member.declarations?.some(
      (declaration) =>
        (ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration)) && mentionsThis(declaration.type),
    ),
  );
}

// An instance of one of Drizzle's classes, like a column or a query.
function isClassInstance(type: ts.Type): boolean {
  const flags = (type as any).objectFlags ?? 0;
  const target = flags & ts.ObjectFlags.Reference ? (type as ts.TypeReference).target : type;
  return Boolean(((target as any).objectFlags ?? 0) & ts.ObjectFlags.Class);
}

export function generateShapes(): { shapes: string; exports: string } {
  const drafts = new Map<string, Draft>();
  const built = new Map<string, string | null>(); // the types at a place, by key, to the shape's name
  const queue: (() => void)[] = [];

  function claimName(wanted: string): string {
    let name = wanted;
    for (let count = 2; drafts.has(name); count++) name = `${wanted}#${count}`;
    return name;
  }

  // Describes the types found at one place, like what integer() returns, and
  // returns the name of the shape, or null if they hold no names of Drizzle's.
  //
  // `input` is true where you write the value, as in the options you pass to a
  // function or what your callback returns. There only what you can write counts:
  // object literals, strings and functions. Something Drizzle made, like a column
  // in `eq(users.id, 1)`, holds no marks of its own there, so it's left out, which
  // keeps Drizzle's internal classes out of the shapes.
  function build(types: readonly ts.Type[], position: string, input: boolean): string | null {
    // Lists of lists of lists only come from types that build themselves up,
    // like UnionToTuple, and hold nothing anyone writes.
    if (isLeftOut(position) || position.includes('[][][]')) return null;
    const kinds = [...new Set(types.flatMap((type) => kindsOf(type)))].filter(
      (type) => !input || !isClassInstance(type),
    );
    const arrays = kinds.filter(isArray);
    const objects = kinds.filter((type) => !isArray(type) && isObject(type));
    const strings = allowsAnyString(kinds) ? [] : kinds.filter((type) => type.isStringLiteral());
    if (arrays.length + objects.length + strings.length === 0) return null;
    const key = `${input ? 'in ' : ''}${[...new Set([...arrays, ...objects, ...strings].map(typeKey))].sort().join(',')}`;
    if (built.has(key)) return built.get(key)!;
    if (built.size > MAX_SHAPES) throw new Error(`More than ${MAX_SHAPES} shapes, at ${position}`);

    const single = arrays.length === 0 && objects.length === 1 ? objects[0] : undefined;
    const symbol = single?.aliasSymbol ?? single?.getSymbol();
    const name = claimName(typeName(symbol) ?? position);
    const draft: Draft = {
      members: new Map(),
      self: false,
      args: [],
      returns: null,
      items: null,
      anyKey: null,
      values: fixedValues(kinds),
    };
    drafts.set(name, draft);
    built.set(key, name);
    // Filled in later, from a queue: Drizzle's types lead so deep that describing
    // each member right away would run out of stack.
    queue.push(() => describe(draft, objects, arrays, position, input));
    return name;
  }

  // A shape for a class that gives what `new` makes, and nothing else.
  function constructorOf(instance: string): string {
    const name = `new ${instance}`;
    if (!drafts.has(name)) {
      drafts.set(name, { members: new Map(), self: false, args: [], returns: instance, items: null, anyKey: null, values: [] });
    }
    return name;
  }

  function describe(draft: Draft, objects: ts.Type[], arrays: ts.Type[], position: string, input: boolean) {
    // The parts of an intersection, like a table's own members and its columns.
    const parts = objects.flatMap((object) => (object.isIntersection() ? object.types : [object]));

    const members = new Map<string, ts.Type[]>();
    const selfMembers = new Set<string>();
    // A part of an intersection that depends on a type parameter, like
    // `TRelationType extends 'many' ? { limit } : {}`, adds the members of
    // either branch. Asked about the whole, TypeScript would only keep the
    // members both branches have.
    const sources = objects.flatMap((object) => [
      object,
      ...(object.isIntersection() ? object.types.filter(isGeneric).flatMap((part) => kindsOf(part)) : []),
    ]);
    for (const object of sources) {
      for (const member of drizzleMembers(object)) {
        members.set(member.name, [...(members.get(member.name) ?? []), checker.getTypeOfSymbol(member)]);
        if (isSelfMember(member)) selfMembers.add(member.name);
      }
    }
    for (const [member, memberTypes] of members) {
      // `_` holds Drizzle's own bookkeeping, like a table's config. The name is
      // Drizzle's, but what it holds is followed no further.
      const ref = member === '_' ? null : build(memberTypes, `${position}.${member}`, input);
      draft.members.set(member, ref);
      if (ref && selfMembers.has(member)) drafts.get(ref)!.self = true;
    }

    const signatures = objects.flatMap(signaturesOf);
    const args: ts.Type[][] = [];
    for (const signature of signatures) {
      argumentTypes(signature).forEach((types, index) => (args[index] ??= []).push(...types));
    }
    // You write the arguments of Drizzle's functions and Drizzle returns the
    // result. For a callback you write, like the one relations() takes, it's the
    // other way round.
    for (let index = 0; index < args.length; index++) {
      draft.args.push(build(args[index] ?? [], `${position}(${index})`, !input));
    }
    draft.self ||= signatures.some(returnsThis);
    if (signatures.length > 0) {
      draft.returns = build(
        signatures.map((signature) => signature.getReturnType()),
        `${position}=>`,
        input,
      );
    }

    // Keys that are yours, each holding something of Drizzle's: a string index
    // signature, like `Record<string, Column>`, or a mapped type over your keys,
    // like the columns of a table. A number index makes it a list.
    const indexes = parts.flatMap((part) => checker.getIndexInfosOfType(part));
    const byKey = (flag: ts.TypeFlags) => indexes.filter((info) => info.keyType.flags & flag).map((info) => info.type);
    const keyed = [
      ...byKey(ts.TypeFlags.String),
      ...parts.filter(isGenericMapped).flatMap((part) => mappedValueType(part) ?? []),
    ];
    if (keyed.length > 0) draft.anyKey = build(keyed, `${position}[key]`, input);
    const items = [...arrays.flatMap(itemTypes), ...byKey(ts.TypeFlags.Number)];
    if (items.length > 0) draft.items = build(items, `${position}[]`, input);
  }

  // What each module's exports hold as values, and as types, as in `tx: PgTransaction`.
  const values = new Map<string, Map<string, string>>();
  const types = new Map<string, Map<string, string>>();
  const exportNames = new Map<string, string[]>();
  const note = (map: typeof values, path: string, name: string, ref: string | null) => {
    if (ref) map.set(path, (map.get(path) ?? new Map()).set(name, ref));
  };
  for (const [path, exports] of moduleExports()) {
    exportNames.set(path, [...exports.keys()].sort());
    for (const [name, symbols] of exports) {
      // A class is mostly imported to name it, as in `instanceof` or as a type.
      // When you make one, as with `new QueryBuilder()`, what you get is
      // described, but not the arguments or the class's static members, which
      // would bring in much of Drizzle's internals.
      const valueSymbols = symbols.filter(
        (symbol) => symbol.flags & ts.SymbolFlags.Value && !(symbol.flags & ts.SymbolFlags.Class),
      );
      const classSymbols = symbols.filter((symbol) => symbol.flags & ts.SymbolFlags.Class);
      if (valueSymbols.length > 0) {
        note(values, path, name, build(valueSymbols.map((symbol) => checker.getTypeOfSymbol(symbol)), `${path}:${name}`, false));
      } else if (classSymbols.length > 0) {
        const instance = build(classSymbols.map((symbol) => checker.getDeclaredTypeOfSymbol(symbol)), `${path}:new ${name}`, false);
        if (instance) note(values, path, name, constructorOf(instance));
      }
      const typeSymbols = symbols.filter((symbol) => symbol.flags & ts.SymbolFlags.Type);
      if (typeSymbols.length > 0) {
        note(types, path, name, build(typeSymbols.map((symbol) => checker.getDeclaredTypeOfSymbol(symbol)), `${path}:type ${name}`, false));
      }
    }
  }
  let done = 0;
  for (let job = queue.shift(); job; job = queue.shift()) {
    job();
    if (++done % 1000 === 0 && process.env.SHAPES_PROGRESS) console.log(`${done} described, ${queue.length} waiting`);
  }

  // Keep only the shapes that lead to a name or a string of Drizzle's: those with
  // members or values, and those that point at one that does.
  const refsOf = (draft: Draft) =>
    [...draft.members.values(), ...draft.args, draft.returns, draft.items, draft.anyKey].filter(Boolean) as string[];
  const useful = new Set(
    [...drafts]
      .filter(([, draft]) => draft.members.size > 0 || draft.values.length > 0 || draft.self)
      .map(([name]) => name),
  );
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, draft] of drafts) {
      if (!useful.has(name) && refsOf(draft).some((ref) => useful.has(ref))) {
        useful.add(name);
        grew = true;
      }
    }
  }
  const live = (ref: string | null) => (ref && useful.has(ref) ? ref : null);
  for (const [name, draft] of [...drafts]) {
    if (!useful.has(name)) {
      drafts.delete(name);
      continue;
    }
    for (const [member, ref] of draft.members) draft.members.set(member, live(ref));
    draft.args = draft.args.map(live);
    draft.returns = live(draft.returns);
    draft.items = live(draft.items);
    draft.anyKey = live(draft.anyKey);
  }

  // Keep one of each set of shapes that came out the same.
  const renames = new Map<string, string>();
  const target = (ref: string | null) => {
    for (let hops = 0; ref && renames.has(ref) && hops < 100; hops++) ref = renames.get(ref)!;
    return ref;
  };
  const retarget = (draft: Draft) => {
    for (const [member, ref] of draft.members) draft.members.set(member, target(ref));
    draft.args = draft.args.map(target);
    draft.returns = target(draft.returns);
    draft.items = target(draft.items);
    draft.anyKey = target(draft.anyKey);
  };
  for (let changed = true; changed; ) {
    changed = false;
    const seen = new Map<string, string>();
    for (const [name, draft] of [...drafts]) {
      retarget(draft);
      const content = JSON.stringify([
        draft.self,
        [...draft.members],
        draft.args,
        draft.returns,
        draft.items,
        draft.anyKey,
        draft.values,
      ]);
      const same = seen.get(content);
      if (same) {
        drafts.delete(name);
        renames.set(name, same);
        changed = true;
      } else {
        seen.set(content, name);
      }
    }
  }
  // The first `#2` whose plain name is free again takes it.
  const claimed = new Set<string>();
  for (const name of [...drafts.keys()]) {
    const base = name.replace(/#\d+$/, '');
    if (base !== name && !drafts.has(base) && !claimed.has(base) && !renames.has(base)) {
      renames.set(name, base);
      claimed.add(base);
    }
  }
  for (const [name, draft] of [...drafts]) {
    retarget(draft);
    if (renames.has(name)) {
      drafts.delete(name);
      drafts.set(target(name)!, draft);
    }
  }
  for (const map of [values, types]) {
    for (const [path, exports] of map) {
      for (const [name, ref] of exports) {
        const final = target(ref)!;
        if (drafts.has(final)) exports.set(name, final);
        else exports.delete(name);
      }
      if (exports.size === 0) map.delete(path);
    }
  }

  return { shapes: render(drafts, values, types), exports: listExports(exportNames) };
}

// Every export of every module, one module to a line, for the test that notices
// when an update to Drizzle adds or renames one.
function listExports(exportNames: Map<string, string[]>): string {
  const versions = packageVersions().map(([folder, version]) => `${folder} ${version}`);
  const lines = [...exportNames].map(([path, names]) => `${path}: ${names.join(' ')}`);
  return `# Read from ${versions.join(', ')}\n${lines.join('\n')}\n`;
}

// Writes the shapes as JSON, one to a line. A shape refers to another by its
// place in the list, and members, arguments and the rest have one-letter names:
// m, a, r, i, k and v. JSON keeps the bundle small and loads fast.
function render(
  drafts: Map<string, Draft>,
  values: Map<string, Map<string, string>>,
  types: Map<string, Map<string, string>>,
): string {
  const names = [...drafts.keys()].sort();
  const index = new Map(names.map((name, position) => [name, position]));
  const at = (ref: string | null) => (ref === null ? null : index.get(ref)!);
  const lines = names.map((name) => {
    const draft = drafts.get(name)!;
    const shape: Record<string, unknown> = {};
    if (draft.members.size > 0) shape.m = Object.fromEntries([...draft.members].map(([member, ref]) => [member, at(ref)]));
    if (draft.args.some(Boolean)) shape.a = draft.args.map(at);
    if (draft.returns) shape.r = at(draft.returns);
    if (draft.items) shape.i = at(draft.items);
    if (draft.anyKey) shape.k = at(draft.anyKey);
    if (draft.values.length > 0) shape.v = draft.values;
    if (draft.self) shape.s = 1;
    return JSON.stringify(shape);
  });
  const exportsOf = (map: Map<string, Map<string, string>>) =>
    [...map]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, entries]) => `${JSON.stringify(path)}:${JSON.stringify(Object.fromEntries([...entries].map(([name, ref]) => [name, at(ref)])))}`)
      .join(',\n');
  return `{"shapes":[\n${lines.join(',\n')}\n],\n"values":{\n${exportsOf(values)}\n},\n"types":{\n${exportsOf(types)}\n}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const { shapes, exports } = generateShapes();
  for (const [file, text] of [
    [OUTPUT_FILE, shapes],
    [EXPORTS_FILE, exports],
  ]) {
    let old = '';
    try {
      old = readFileSync(file, 'utf8');
    } catch {}
    if (text !== old) writeFileSync(file, text);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Wrote src/generatedShapes.json and test/drizzleExports.txt in ${seconds} s`);
  if (givenUp > 0) console.log(`TypeScript ran out of stack ${givenUp} times, so some shapes may be missing members`);
}
