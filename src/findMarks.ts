// Finds Drizzle's names in a file.
//
// This file knows nothing about VS Code: text goes in, positions come out.
// That keeps it easy to test (see test/findMarks.test.ts).
//
// acorn parses the file into a tree of "nodes": one for each import, function,
// call, name and so on. Its TypeScript plugin, the one Svelte uses, teaches it
// TypeScript and JSX. We walk that tree and note where Drizzle's names are.
//
// Most of Drizzle's names are members of what Drizzle gives you, like `notNull`
// in `text().notNull()` or `where` in `db.select().from(users).where(...)`. So
// the walk follows each value from where it was made, using the shapes in
// shapes.ts, which say what each of Drizzle's values holds. A value can come
// from another file of yours, like `db` from `$lib/server/db`, so imports are
// followed too, through `context.readImport`.

import { Parser } from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import {
  DRIZZLE_MODULE,
  exportShape,
  exportTypeShape,
  hasMember,
  hasValue,
  memberShape,
  moduleShape,
  type Shape,
} from './shapes.ts';

export interface Mark {
  start: number;
  end: number;
}

export interface Result {
  marks: Mark[];
  // False when the file couldn't be parsed, usually because it's half-typed.
  complete: boolean;
}

export interface Options {
  // True for .tsx, .jsx and .js files, where `<div>` can be JSX.
  jsx: boolean;
  // True for .d.ts files, where functions have no bodies.
  dts: boolean;
}

// Another file of yours that an import leads to.
export interface ImportedFile {
  fileName: string;
  text: string;
  // Changes whenever the text does, so a parsed file can be reused until then.
  version: string | number;
}

export interface Context {
  // Where the file is, for following its imports.
  fileName?: string;
  // Finds the file an import path leads to, like `$lib/server/db`, or null for a
  // package or a file that isn't there.
  readImport?(path: string, fromFile: string): ImportedFile | null;
}

// A node of the tree. Each kind has its own fields, so they stay loose here.
type Node = { type: string; start: number; end: number; [field: string]: any };

// The parser needs to know up front whether `<T>(x) => x` is a generic function,
// as in a .ts file, or the start of a JSX element, as in a .tsx file.
const parsers = new Map<string, typeof Parser>();

function parserFor({ jsx, dts }: Options): typeof Parser {
  const key = `${jsx} ${dts}`;
  let parser = parsers.get(key);
  if (!parser) {
    parser = Parser.extend(tsPlugin({ jsx, dts }));
    parsers.set(key, parser);
  }
  return parser;
}

function parse(text: string, options: Options): Node | null {
  try {
    return parserFor(options).parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // The TypeScript plugin refuses to run without line and column numbers.
      locations: true,
      allowHashBang: true,
    }) as unknown as Node;
  } catch {
    return null;
  }
}

function optionsFor(fileName: string): Options {
  return { jsx: !/\.[cm]?ts$/.test(fileName), dts: /\.d\.[cm]?ts$/.test(fileName) };
}

// Other files, parsed, until their text changes. Parsing is the slow part of
// reading a file, and the same few files are read on every repaint.
const parsedFiles = new Map<string, { version: string | number; program: Node | null }>();
const MAX_PARSED_FILES = 200;

function parseImported(file: ImportedFile): Node | null {
  const cached = parsedFiles.get(file.fileName);
  if (cached && cached.version === file.version) return cached.program;
  const program = parse(file.text, optionsFor(file.fileName));
  parsedFiles.delete(file.fileName);
  parsedFiles.set(file.fileName, { version: file.version, program });
  if (parsedFiles.size > MAX_PARSED_FILES) parsedFiles.delete(parsedFiles.keys().next().value!);
  return program;
}

// Fields that hold where a node is, not other nodes.
const POSITION_FIELDS = new Set(['type', 'start', 'end', 'loc', 'range']);

const NO_FIELDS = new Set<string>();
const KEY_FIELD = new Set(['key']);
const ID_FIELD = new Set(['id']);

// Nodes that have parameters of their own, from functions to function types.
const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'TSDeclareFunction',
  'TSDeclareMethod',
  'TSFunctionType',
  'TSConstructorType',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSMethodSignature',
]);

// Functions that run, as opposed to function types.
const CODE_FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

// Class and object type members whose key is a name you choose, like `eq` in
// `class A { eq = 1 }`. A computed key, like `[eq]`, is code, so it gets walked.
const KEYED_MEMBERS = new Set([
  'PropertyDefinition',
  'MethodDefinition',
  'AccessorProperty',
  'TSAbstractPropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSAbstractAccessorProperty',
  'TSPropertySignature',
]);

// TypeScript wrappers that don't change the value inside: `x as T`, `x!` and so on.
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
  'ChainExpression',
  'ParenthesizedExpression',
]);

function unwrap(node: Node | null | undefined): Node | null | undefined {
  while (node && WRAPPERS.has(node.type)) node = node.expression;
  return node;
}

function isDrizzleSource(node: Node | null | undefined): node is Node {
  return node?.type === 'Literal' && typeof node.value === 'string' && DRIZZLE_MODULE.test(node.value);
}

// The name of a key, like `where` in `{ where: ... }` or in `{ 'where': ... }`.
function keyName(node: Node, computed: boolean): string | undefined {
  if (computed) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}

// The names a pattern declares: `a`, or `b` and `c` in `{ b, d: [c] }`.
function patternNames(node: Node | null | undefined): string[] {
  switch (node?.type) {
    case 'Identifier':
      return [node.name];
    case 'ObjectPattern':
      return node.properties.flatMap((property: Node) =>
        patternNames(property.type === 'RestElement' ? property.argument : property.value),
      );
    case 'ArrayPattern':
      return node.elements.flatMap(patternNames);
    case 'AssignmentPattern':
      return patternNames(node.left);
    case 'RestElement':
      return patternNames(node.argument);
    case 'TSParameterProperty':
      return patternNames(node.parameter);
    default:
      return [];
  }
}

// The type parameters a function, class or type declares, like `T` in `<T>`.
function typeParameterNames(node: Node): string[] {
  const params: Node[] = node.typeParameters?.params ?? [];
  return params.map((param) => (typeof param.name === 'string' ? param.name : param.name?.name));
}

// The values a function returns: its body, for `() => value`, or what each of
// its `return` statements gives. Functions inside it return their own values.
function returnedValues(fn: Node): Node[] {
  if (fn.body?.type !== 'BlockStatement') return fn.body ? [fn.body] : [];
  const values: Node[] = [];
  const walk = (node: any) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ReturnStatement') {
      if (node.argument) values.push(node.argument);
      return;
    }
    if (FUNCTION_NODES.has(node.type) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return;
    for (const field in node) {
      if (POSITION_FIELDS.has(field)) continue;
      const value = node[field];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(fn.body);
  return values;
}

// A step from a value to a name taken out of it: a member, as `query` is in
// `const { query } = db`, or an item, as `first` is in `const [first] = rows`.
type Step = string | 0;

// What a name stands for, where it's declared.
interface Binding {
  // Uses of the name get a mark, as with an imported `eq`, or `many` taken from
  // what relations() passes. Can depend on what the value turns out to hold.
  marked?: boolean | (() => boolean);
  // What the name holds, when that's known up front.
  shape?: Shape | null;
  // What it describes as a type, as `PgTransaction` does in `tx: PgTransaction`.
  typeShape?: Shape | null;
  // The module a namespace import stands for, for `t.PgColumn` in a type.
  module?: string;
  // Or where to find out: the value it was set to, the steps from there for a
  // name taken out of it, and the scope to read that value in.
  init?: Node;
  path?: Step[];
  scope?: Scope | null;
  // A type the name was declared with, as in `const db: Database = ...`.
  annotation?: Node;
  // A type alias, as in `type Database = typeof db`.
  typeNode?: Node;
  // A function declared under this name.
  fn?: Node;
  // An import from a file of yours.
  from?: { path: string; name: string };
  // Filled in the first time the shape is asked for.
  state?: 'resolving' | 'resolved';
  cached?: Shape | null;
}

// The names one function, block or file declares, and the scope around it.
// null stands for a name of yours that holds nothing known.
interface Scope {
  names: Map<string, Binding | null>;
  parent: Scope | null;
}

function lookup(name: string, scope: Scope | null): Binding | null | undefined {
  for (let current = scope; current; current = current.parent) {
    if (current.names.has(name)) return current.names.get(name);
  }
  return undefined;
}

// Everything a single findMarks call reads: the file being marked, and the
// files its imports lead to, each read at most once.
class Session {
  readonly analyses = new Map<string, Analysis | null>();
  readonly context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  // The analysis of the file an import leads to.
  imported(path: string, fromFile: string | undefined): Analysis | null {
    if (!fromFile || !this.context.readImport) return null;
    let file: ImportedFile | null = null;
    try {
      file = this.context.readImport(path, fromFile);
    } catch {
      return null;
    }
    if (!file) return null;
    if (this.analyses.has(file.fileName)) return this.analyses.get(file.fileName)!;
    const program = parseImported(file);
    const analysis = program ? new Analysis(program, file.fileName, this, false) : null;
    this.analyses.set(file.fileName, analysis);
    return analysis;
  }
}

class Analysis {
  readonly marks: Mark[] = [];
  readonly top: Scope | null;
  // What the functions you pass to Drizzle receive, and what they should return,
  // noted when the walk reaches the call, before it reaches the function.
  private readonly paramShapes = new WeakMap<Node, (Shape | null)[]>();
  private readonly returnShapes = new WeakMap<Node, Shape>();
  private readonly walked = new WeakMap<Node, Scope | null>();
  private readonly walkedAgain = new WeakSet<Node>();
  private readonly following = new Set<Node>();
  private readonly fnResults = new WeakMap<Node, Shape | null | 'resolving'>();
  private exportsIndex?: Map<string, () => Shape | null>;
  private starExports: string[] = [];
  private namespace?: Shape;

  readonly program: Node;
  readonly fileName: string | undefined;
  readonly session: Session;
  // Only the file being marked gets marks. Imported files are only read.
  readonly marking: boolean;

  constructor(program: Node, fileName: string | undefined, session: Session, marking: boolean) {
    this.program = program;
    this.fileName = fileName;
    this.session = session;
    this.marking = marking;
    this.top = this.withDeclarations(program.body, null);
  }

  // --- Marks --------------------------------------------------------------

  private add(start: number, end: number) {
    if (this.marking && start >= 0 && start < end) this.marks.push({ start, end });
  }

  // Only the name, not a type that follows it, like `: string` after a parameter.
  private markName(node: Node) {
    this.add(node.start, node.start + node.name.length);
  }

  // The text of a string without its quotes: `drizzle-orm` in 'drizzle-orm'.
  private markString(node: Node) {
    this.add(node.start + 1, node.end - 1);
  }

  private markKey(node: Node) {
    if (node.type === 'Identifier') this.markName(node);
    else if (node.type === 'Literal') this.markString(node);
  }

  // `SQL` in `import('drizzle-orm').SQL`, and each part of `a.b.C`.
  private markQualifier(node: Node | null | undefined) {
    if (node?.type === 'Identifier') this.markName(node);
    else if (node?.type === 'TSQualifiedName') {
      this.markQualifier(node.left);
      this.markName(node.right);
    }
  }

  // A string whose text Drizzle fixes, like 'cascade' in `onDelete: 'cascade'`.
  private markFixedValue(node: Node, shape: Shape) {
    const isPlainTemplate = node.type === 'TemplateLiteral' && node.expressions.length === 0;
    const text = isPlainTemplate ? node.quasis[0].value.cooked : node.value;
    if (typeof text === 'string' && hasValue(shape, text)) this.add(node.start + 1, node.end - 1);
  }

  // --- Declarations ---------------------------------------------------------

  private declareImport(node: Node, scope: Scope) {
    const path = node.source.value as string;
    const fromDrizzle = isDrizzleSource(node.source);
    if (fromDrizzle) this.markString(node.source);
    for (const specifier of node.specifiers) {
      const local: string = specifier.local.name;
      if (specifier.type === 'ImportNamespaceSpecifier') {
        // `t` in `import * as t` is a name you chose, but what it holds is Drizzle's.
        scope.names.set(
          local,
          fromDrizzle ? { shape: moduleShape(path), module: path } : { from: { path, name: '*' } },
        );
        continue;
      }
      const imported =
        specifier.type === 'ImportDefaultSpecifier' ? 'default' : (keyName(specifier.imported, false) ?? 'default');
      if (!fromDrizzle) {
        scope.names.set(local, { from: { path, name: imported } });
        continue;
      }
      // `equals` in `import { eq as equals }` is a name you chose, so it and its
      // uses stay unmarked. So is a default import's name.
      const ownSpelling = specifier.type === 'ImportSpecifier' && imported === local;
      if (specifier.type === 'ImportSpecifier') this.markKey(specifier.imported);
      if (ownSpelling) this.markName(specifier.local);
      scope.names.set(local, {
        marked: ownSpelling,
        shape: exportShape(path, imported),
        typeShape: exportTypeShape(path, imported),
      });
    }
  }

  // Notes the names a statement declares in its scope.
  private declareStatement(node: Node | null | undefined, scope: Scope) {
    switch (node?.type) {
      case 'ImportDeclaration':
        this.declareImport(node, scope);
        break;
      case 'TSImportEqualsDeclaration': {
        // `import d = require('drizzle-orm')` gives the whole module, like `import * as`.
        const reference = node.moduleReference;
        const source = reference?.type === 'TSExternalModuleReference' ? reference.expression : null;
        if (isDrizzleSource(source)) {
          this.markString(source);
          scope.names.set(node.id.name, { shape: moduleShape(source.value), module: source.value });
        } else {
          scope.names.set(node.id.name, null);
        }
        break;
      }
      case 'VariableDeclaration':
        // `var` belongs to the whole function, but noting it in its block is close
        // enough: it only matters for a `var` that hides another name.
        for (const declarator of node.declarations) this.declarePattern(declarator.id, declarator.init, [], scope);
        break;
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
        if (node.id) scope.names.set(node.id.name, { fn: node, scope });
        break;
      case 'TSTypeAliasDeclaration':
        scope.names.set(node.id.name, { typeNode: node.typeAnnotation, scope });
        break;
      case 'ClassDeclaration':
      case 'TSInterfaceDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
        if (node.id?.type === 'Identifier') scope.names.set(node.id.name, null);
        break;
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        this.declareStatement(node.declaration, scope);
        break;
    }
  }

  // Notes each name in `const a = value` or `const { b, c: [d] } = value`, with
  // the steps from the value to it.
  private declarePattern(pattern: Node | null | undefined, init: Node | null | undefined, path: Step[], scope: Scope) {
    switch (pattern?.type) {
      case 'Identifier': {
        if (!init) {
          scope.names.set(pattern.name, pattern.typeAnnotation ? { annotation: pattern.typeAnnotation, scope } : null);
          return;
        }
        const binding: Binding = { init, path, scope, annotation: pattern.typeAnnotation };
        const key = path.at(-1);
        // `query` in `const { query } = db` keeps Drizzle's spelling, so its uses
        // get marks too.
        if (typeof key === 'string' && key === pattern.name) {
          binding.marked = () => hasMember(this.follow(init, path.slice(0, -1), scope), key);
        }
        scope.names.set(pattern.name, binding);
        return;
      }
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          if (property.type === 'RestElement') {
            for (const name of patternNames(property)) scope.names.set(name, null);
            continue;
          }
          const key = keyName(property.key, property.computed);
          if (key === undefined) {
            for (const name of patternNames(property.value)) scope.names.set(name, null);
          } else {
            this.declarePattern(property.value, init, [...path, key], scope);
          }
        }
        return;
      case 'ArrayPattern':
        for (const element of pattern.elements) this.declarePattern(element, init, [...path, 0], scope);
        return;
      case 'AssignmentPattern':
        this.declarePattern(pattern.left, init, path, scope);
        return;
      default:
        for (const name of patternNames(pattern)) scope.names.set(name, null);
    }
  }

  private withNames(names: Iterable<string>, scope: Scope | null): Scope | null {
    const map = new Map<string, Binding | null>();
    for (const name of names) map.set(name, null);
    return map.size === 0 ? scope : { names: map, parent: scope };
  }

  private withDeclarations(statements: Node[], parent: Scope | null): Scope | null {
    const scope: Scope = { names: new Map(), parent };
    for (const statement of statements) this.declareStatement(statement, scope);
    return scope.names.size === 0 ? parent : scope;
  }

  // --- What values hold -----------------------------------------------------

  private isMarked(binding: Binding | null | undefined): boolean {
    const marked = binding?.marked;
    return typeof marked === 'function' ? marked() : Boolean(marked);
  }

  // What a name holds, worked out the first time it's asked for.
  private bindingShape(binding: Binding | null | undefined): Shape | null {
    if (!binding) return null;
    if (binding.shape !== undefined) return binding.shape;
    if (binding.state === 'resolved') return binding.cached ?? null;
    if (binding.state === 'resolving') return null;
    binding.state = 'resolving';
    let shape: Shape | null = null;
    if (binding.from) {
      shape = this.session.imported(binding.from.path, this.fileName)?.exportedShape(binding.from.name) ?? null;
    } else if (binding.fn) {
      shape = this.functionShape(binding.fn, binding.scope ?? null);
    } else if (binding.init) {
      shape = this.follow(binding.init, binding.path ?? [], binding.scope ?? null);
    }
    if (!shape && binding.annotation) shape = this.typeShapeOf(binding.annotation, binding.scope ?? null);
    binding.state = 'resolved';
    binding.cached = shape;
    return shape;
  }

  // What a value holds after taking each step out of it.
  private follow(init: Node, path: Step[], scope: Scope | null): Shape | null {
    let shape = this.shapeOf(init, scope);
    for (const step of path) {
      if (!shape) return null;
      shape = step === 0 ? (shape.items ?? null) : memberShape(shape, step);
    }
    return shape;
  }

  // A function you wrote, like `getDb`, holds nothing of Drizzle's itself, but
  // calling it gives what it returns, as in `getDb(env.DB).select()`. That works
  // the same for a function imported from another file of yours.
  private readonly functionShapes = new WeakMap<Node, Shape>();
  private functionShape(fn: Node, scope: Scope | null): Shape | null {
    if (!CODE_FUNCTIONS.has(fn.type)) return null;
    let shape = this.functionShapes.get(fn);
    if (!shape) {
      const analysis = this;
      shape = {
        get returns() {
          return analysis.resultOf(fn, scope);
        },
      };
      this.functionShapes.set(fn, shape);
    }
    return shape;
  }

  // What calling a function of yours gives, from what it returns.
  private resultOf(fn: Node, scope: Scope | null): Shape | null {
    const cached = this.fnResults.get(fn);
    if (cached === 'resolving') return null;
    if (cached !== undefined) return cached;
    this.fnResults.set(fn, 'resolving');
    const params = this.withNames(
      (fn.params ?? []).flatMap((param: Node) => patternNames(param)),
      scope,
    );
    const body = fn.body?.type === 'BlockStatement' ? this.withDeclarations(fn.body.body, params) : params;
    let shape: Shape | null = null;
    for (const value of returnedValues(fn)) {
      shape = this.shapeOf(value, body);
      if (shape) break;
    }
    this.fnResults.set(fn, shape);
    return shape;
  }

  // What a piece of code holds, if it's something of Drizzle's: `db.select()`
  // holds a select builder when `db` holds what drizzle() returns.
  shapeOf(node: Node | null | undefined, scope: Scope | null): Shape | null {
    const inner = unwrap(node);
    switch (inner?.type) {
      case 'Identifier':
        return this.bindingShape(lookup(inner.name, scope));
      case 'MemberExpression': {
        const object = this.shapeOf(inner.object, scope);
        if (!object) return null;
        if (!inner.computed) return memberShape(object, inner.property.name);
        const property = inner.property;
        if (property.type === 'Literal' && typeof property.value === 'number') return object.items ?? null;
        if (property.type === 'Literal' && typeof property.value === 'string') return memberShape(object, property.value);
        return object.anyKey ?? object.items ?? null;
      }
      case 'CallExpression':
      case 'NewExpression': {
        const callee = this.shapeOf(inner.callee, scope);
        // `text().notNull()` is still the text column, with all its methods.
        if (callee?.self) {
          const receiver = unwrap(inner.callee);
          if (receiver?.type === 'MemberExpression') return this.shapeOf(receiver.object, scope) ?? callee.returns ?? null;
        }
        return callee?.returns ?? null;
      }
      case 'TaggedTemplateExpression':
        return this.shapeOf(inner.tag, scope)?.returns ?? null;
      case 'AwaitExpression':
        return this.shapeOf(inner.argument, scope);
      case 'ImportExpression': {
        const source = inner.source;
        if (isDrizzleSource(source)) return moduleShape(source.value);
        if (source?.type === 'Literal' && typeof source.value === 'string') {
          return this.session.imported(source.value, this.fileName)?.exportedShape('*') ?? null;
        }
        return null;
      }
      case 'ConditionalExpression':
        return this.shapeOf(inner.consequent, scope) ?? this.shapeOf(inner.alternate, scope);
      case 'LogicalExpression':
        return this.shapeOf(inner.left, scope) ?? this.shapeOf(inner.right, scope);
      case 'SequenceExpression':
        return this.shapeOf(inner.expressions.at(-1), scope);
      case 'AssignmentExpression':
        return this.shapeOf(inner.right, scope);
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return this.functionShape(inner, scope);
      default:
        return null;
    }
  }

  // What a type stands for, if it's one of Drizzle's: `PgTransaction`, or
  // `typeof db`.
  typeShapeOf(node: Node | null | undefined, scope: Scope | null): Shape | null {
    switch (node?.type) {
      case 'TSTypeAnnotation':
      case 'TSParenthesizedType':
        return this.typeShapeOf(node.typeAnnotation, scope);
      case 'TSTypeReference':
        return this.typeOfEntity(node.typeName, scope);
      case 'TSTypeQuery':
        return this.entityShape(node.exprName, scope);
      case 'TSUnionType':
      case 'TSIntersectionType':
        for (const type of node.types) {
          const shape = this.typeShapeOf(type, scope);
          if (shape) return shape;
        }
        return null;
      case 'TSArrayType': {
        const items = this.typeShapeOf(node.elementType, scope);
        return items ? { items } : null;
      }
      default:
        return null;
    }
  }

  // The value a name in a type stands for: `db` in `typeof db`, or
  // `users.$inferSelect` in `typeof users.$inferSelect`.
  private entityShape(node: Node, scope: Scope | null): Shape | null {
    if (node.type === 'Identifier') return this.bindingShape(lookup(node.name, scope));
    if (node.type === 'TSQualifiedName') return memberShape(this.entityShape(node.left, scope), node.right.name);
    return null;
  }

  // The type a name stands for: `PgTransaction`, or `t.PgTransaction` after
  // `import * as t from 'drizzle-orm/pg-core'`.
  private typeOfEntity(node: Node, scope: Scope | null): Shape | null {
    if (node.type === 'Identifier') {
      const binding = lookup(node.name, scope);
      if (!binding) return null;
      if (binding.typeShape !== undefined) return binding.typeShape;
      if (binding.typeNode) {
        if (binding.state === 'resolving') return null;
        binding.state = 'resolving';
        const shape = this.typeShapeOf(binding.typeNode, binding.scope ?? null);
        binding.state = undefined;
        return shape;
      }
      if (binding.from) {
        return this.session.imported(binding.from.path, this.fileName)?.exportedTypeShape(binding.from.name) ?? null;
      }
      return null;
    }
    if (node.type === 'TSQualifiedName' && node.left.type === 'Identifier') {
      const binding = lookup(node.left.name, scope);
      if (binding?.module) return exportTypeShape(binding.module, node.right.name);
    }
    return null;
  }

  // --- Another file's exports -----------------------------------------------

  private indexExports(): Map<string, () => Shape | null> {
    if (this.exportsIndex) return this.exportsIndex;
    const index = new Map<string, () => Shape | null>();
    const local = (name: string) => () => this.bindingShape(lookup(name, this.top));
    const passed = (path: string, name: string) => () =>
      DRIZZLE_MODULE.test(path)
        ? name === '*'
          ? moduleShape(path)
          : exportShape(path, name)
        : (this.session.imported(path, this.fileName)?.exportedShape(name) ?? null);
    for (const statement of this.program.body) {
      if (statement.type === 'ExportNamedDeclaration') {
        if (statement.declaration) {
          const declaration = statement.declaration;
          const names =
            declaration.type === 'VariableDeclaration'
              ? declaration.declarations.flatMap((item: Node) => patternNames(item.id))
              : declaration.id?.type === 'Identifier'
                ? [declaration.id.name]
                : [];
          for (const name of names) index.set(name, local(name));
        }
        for (const specifier of statement.specifiers ?? []) {
          const exported = keyName(specifier.exported, false);
          const name = specifier.local ? keyName(specifier.local, false) : '*';
          if (exported === undefined || name === undefined) continue;
          index.set(exported, statement.source ? passed(statement.source.value, name) : local(name));
        }
      } else if (statement.type === 'ExportAllDeclaration') {
        const exported = statement.exported ? keyName(statement.exported, false) : undefined;
        if (exported) index.set(exported, passed(statement.source.value, '*'));
        else this.starExports.push(statement.source.value);
      } else if (statement.type === 'ExportDefaultDeclaration') {
        const declaration = statement.declaration;
        index.set('default', () =>
          declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration'
            ? null
            : this.shapeOf(declaration, this.top),
        );
      }
    }
    this.exportsIndex = index;
    return index;
  }

  // What one of this file's exports holds, for a file that imports it.
  exportedShape(name: string): Shape | null {
    if (name === '*') {
      // `import * as schema from './schema'`: the names are yours, but what each
      // holds is known, so `schema.users.$inferSelect` gets a mark.
      this.namespace ??= { own: (member) => this.exportedShape(member) };
      return this.namespace;
    }
    const found = this.indexExports().get(name);
    if (found) return found();
    for (const path of this.starExports) {
      const shape = DRIZZLE_MODULE.test(path)
        ? exportShape(path, name)
        : (this.session.imported(path, this.fileName)?.exportedShape(name) ?? null);
      if (shape) return shape;
    }
    return null;
  }

  // What one of this file's exported types describes, as in
  // `export type Database = typeof db`.
  exportedTypeShape(name: string): Shape | null {
    const binding = lookup(name, this.top);
    if (!binding) return null;
    if (binding.typeShape !== undefined) return binding.typeShape;
    if (binding.typeNode) return this.typeShapeOf(binding.typeNode, binding.scope ?? null);
    if (binding.from) {
      return this.session.imported(binding.from.path, this.fileName)?.exportedTypeShape(binding.from.name) ?? null;
    }
    return null;
  }

  // --- Values you write for Drizzle -----------------------------------------

  // Marks the keys and strings Drizzle knows in a value you write for Drizzle to
  // read, like `{ onDelete: 'cascade' }`, and notes what Drizzle will pass to
  // any function in it.
  private expect(node: Node | null | undefined, shape: Shape | null | undefined, scope: Scope | null) {
    const inner = unwrap(node);
    if (!shape || !inner) return;
    switch (inner.type) {
      case 'ObjectExpression':
        for (const property of inner.properties) {
          if (property.type !== 'Property') continue;
          const name = keyName(property.key, property.computed);
          if (hasMember(shape, name)) {
            this.markKey(property.key);
            this.expect(property.value, memberShape(shape, name), scope);
          } else if (name !== undefined && shape.anyKey) {
            this.expect(property.value, shape.anyKey, scope);
          }
        }
        break;
      case 'ArrayExpression':
        for (const element of inner.elements) {
          if (element?.type !== 'SpreadElement') this.expect(element, shape.items, scope);
        }
        break;
      case 'Literal':
      case 'TemplateLiteral':
        this.markFixedValue(inner, shape);
        break;
      case 'ConditionalExpression':
        this.expect(inner.consequent, shape, scope);
        this.expect(inner.alternate, shape, scope);
        break;
      case 'LogicalExpression':
        this.expect(inner.left, shape, scope);
        this.expect(inner.right, shape, scope);
        break;
      case 'Identifier': {
        // A value set elsewhere, like `const config = { ... }` passed by name.
        const binding = lookup(inner.name, scope);
        const value = binding?.fn ?? (binding?.path?.length ? undefined : binding?.init);
        if (!value || this.following.has(value)) break;
        this.following.add(value);
        this.expect(value, shape, binding!.scope ?? null);
        this.following.delete(value);
        break;
      }
      default:
        if (CODE_FUNCTIONS.has(inner.type)) this.expectFunction(inner, shape);
    }
  }

  private expectFunction(fn: Node, shape: Shape) {
    if (shape.args) this.paramShapes.set(fn, shape.args);
    if (shape.returns) this.returnShapes.set(fn, shape.returns);
    // A function declared before the call that receives it was walked without
    // knowing its parameters, so it's walked once more.
    if (this.walked.has(fn) && !this.walkedAgain.has(fn)) {
      this.walkedAgain.add(fn);
      this.visit(fn, this.walked.get(fn)!);
    }
  }

  // --- The walk ------------------------------------------------------------

  // Notes the names a parameter takes from what Drizzle passes. In
  // `({ one, many }) => ...`, both keys get a mark, and so does every use of them.
  private bindParam(param: Node | null | undefined, given: Shape | null, scope: Scope, outer: Scope | null) {
    if (!param) return;
    const shape = given ?? (param.typeAnnotation ? this.typeShapeOf(param.typeAnnotation, outer) : null);
    switch (param.type) {
      case 'Identifier':
        scope.names.set(
          param.name,
          given ? { shape: given } : param.typeAnnotation ? { annotation: param.typeAnnotation, scope: outer } : null,
        );
        return;
      case 'AssignmentPattern':
        this.bindParam(param.left, given, scope, outer);
        return;
      case 'TSParameterProperty':
        this.bindParam(param.parameter, given, scope, outer);
        return;
      case 'ArrayPattern':
        for (const element of param.elements) this.bindParam(element, shape?.items ?? null, scope, outer);
        return;
      case 'ObjectPattern':
        for (const property of param.properties) {
          if (property.type === 'RestElement') {
            for (const name of patternNames(property)) scope.names.set(name, null);
            continue;
          }
          const key = keyName(property.key, property.computed);
          const isMember = hasMember(shape, key);
          if (isMember) this.markKey(property.key);
          const inner = memberShape(shape, key);
          const value = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
          if (value.type === 'Identifier') {
            scope.names.set(value.name, inner || isMember ? { shape: inner, marked: isMember && value.name === key } : null);
          } else {
            this.bindParam(value, inner, scope, outer);
          }
        }
        return;
      default:
        for (const name of patternNames(param)) scope.names.set(name, null);
    }
  }

  // Marks the keys of `const { query } = db` that are Drizzle's.
  private markPatternKeys(pattern: Node | null | undefined, shape: Shape | null) {
    if (!shape || !pattern) return;
    switch (pattern.type) {
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          if (property.type === 'RestElement') continue;
          const key = keyName(property.key, property.computed);
          if (hasMember(shape, key)) this.markKey(property.key);
          this.markPatternKeys(property.value, memberShape(shape, key));
        }
        break;
      case 'ArrayPattern':
        for (const element of pattern.elements) this.markPatternKeys(element, shape.items ?? null);
        break;
      case 'AssignmentPattern':
        this.markPatternKeys(pattern.left, shape);
        break;
    }
  }

  private visitStatements(statements: Node[], scope: Scope | null) {
    const inner = this.withDeclarations(statements, scope);
    for (const statement of statements) this.visit(statement, inner);
  }

  // Walks every child node except the fields in `skip`.
  private visitChildren(node: Node, scope: Scope | null, skip: Set<string> = NO_FIELDS) {
    for (const field in node) {
      if (POSITION_FIELDS.has(field) || skip.has(field)) continue;
      const value = node[field];
      if (Array.isArray(value)) {
        for (const item of value) this.visit(item, scope);
      } else {
        this.visit(value, scope);
      }
    }
  }

  // Walks the parts of a pattern that are code, like the default in `a = eq`
  // and the type in `a: SQL`. The names it declares aren't uses of anything.
  private visitPattern(node: Node | null | undefined, scope: Scope | null) {
    if (!node) return;
    switch (node.type) {
      case 'Identifier':
        break;
      case 'ObjectPattern':
        for (const property of node.properties) {
          if (property.type === 'RestElement') {
            this.visitPattern(property, scope);
          } else {
            if (property.computed) this.visit(property.key, scope);
            this.visitPattern(property.value, scope);
          }
        }
        break;
      case 'ArrayPattern':
        for (const element of node.elements) this.visitPattern(element, scope);
        break;
      case 'AssignmentPattern':
        this.visitPattern(node.left, scope);
        this.visit(node.right, scope);
        break;
      case 'RestElement':
        this.visitPattern(node.argument, scope);
        break;
      case 'TSParameterProperty':
        this.visitPattern(node.parameter, scope);
        break;
      default:
        // Something being assigned to, like `a.b` in `[a.b] = list`.
        this.visit(node, scope);
        return;
    }
    this.visit(node.typeAnnotation, scope);
    for (const decorator of node.decorators ?? []) this.visit(decorator, scope);
  }

  private visitFunction(node: Node, scope: Scope | null) {
    // A method's name, like `m` in `{ m(): void }`, is yours unless it's computed.
    if (node.computed) this.visit(node.key, scope);
    const params: Node[] = node.params ?? node.parameters ?? [];
    const own: Scope = { names: new Map(), parent: scope };
    for (const name of typeParameterNames(node)) own.names.set(name, null);
    // A function expression's own name can only be used inside it.
    if (node.type === 'FunctionExpression' && node.id) own.names.set(node.id.name, null);
    const given = this.paramShapes.get(node);
    params.forEach((param, index) => this.bindParam(param, given?.[index] ?? null, own, scope));
    const inner = own.names.size === 0 ? scope : own;
    if (CODE_FUNCTIONS.has(node.type)) this.walked.set(node, scope);
    this.visit(node.typeParameters, inner);
    for (const param of params) this.visitPattern(param, inner);
    this.visit(node.returnType ?? node.typeAnnotation, inner);
    const expected = this.returnShapes.get(node);
    if (expected) {
      const body = node.body?.type === 'BlockStatement' ? this.withDeclarations(node.body.body, inner) : inner;
      for (const value of returnedValues(node)) this.expect(value, expected, body);
    }
    this.visit(node.body, inner);
  }

  private visitCall(node: Node, scope: Scope | null) {
    const callee = this.shapeOf(node.callee, scope);
    const args = callee?.args;
    if (args) {
      node.arguments.forEach((argument: Node, index: number) => {
        if (argument.type !== 'SpreadElement') this.expect(argument, args[index], scope);
      });
    }
    this.visitChildren(node, scope);
  }

  visit(node: Node | null | undefined, scope: Scope | null) {
    if (!node || typeof node.type !== 'string') return;

    if (FUNCTION_NODES.has(node.type)) return this.visitFunction(node, scope);

    if (KEYED_MEMBERS.has(node.type)) {
      this.visitChildren(node, scope, node.computed ? NO_FIELDS : KEY_FIELD);
      return;
    }

    switch (node.type) {
      case 'Identifier':
        if (this.isMarked(lookup(node.name, scope))) this.markName(node);
        return;

      case 'Program':
        // The top scope was set up when the analysis started.
        for (const statement of node.body) this.visit(statement, this.top);
        return;
      case 'BlockStatement':
      case 'StaticBlock':
      case 'TSModuleBlock':
        this.visitStatements(node.body, scope);
        return;

      case 'SwitchStatement': {
        this.visit(node.discriminant, scope);
        const inner = this.withDeclarations(
          node.cases.flatMap((switchCase: Node) => switchCase.consequent),
          scope,
        );
        for (const switchCase of node.cases) {
          this.visit(switchCase.test, inner);
          for (const statement of switchCase.consequent) this.visit(statement, inner);
        }
        return;
      }

      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        this.visitChildren(node, this.withDeclarations([node.init ?? node.left], scope));
        return;

      case 'CatchClause': {
        const inner = this.withNames(patternNames(node.param), scope);
        this.visitPattern(node.param, inner);
        this.visit(node.body, inner);
        return;
      }

      case 'VariableDeclarator': {
        this.visitPattern(node.id, scope);
        // `const config: Config = { ... }` is written for Drizzle to read.
        if (node.id.typeAnnotation) this.expect(node.init, this.typeShapeOf(node.id.typeAnnotation, scope), scope);
        if (node.id.type !== 'Identifier') this.markPatternKeys(node.id, this.shapeOf(node.init, scope));
        this.visit(node.init, scope);
        return;
      }

      case 'CallExpression':
      case 'NewExpression':
        this.visitCall(node, scope);
        return;

      case 'TSSatisfiesExpression':
      case 'TSAsExpression':
        // `{ ... } satisfies Config` is written for Drizzle to read.
        this.expect(node.expression, this.typeShapeOf(node.typeAnnotation, scope), scope);
        this.visitChildren(node, scope);
        return;

      case 'ClassDeclaration':
      case 'ClassExpression': {
        const names = typeParameterNames(node);
        if (node.type === 'ClassExpression' && node.id) names.push(node.id.name);
        this.visitChildren(node, this.withNames(names, scope), ID_FIELD);
        return;
      }

      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        this.visitChildren(node, this.withNames(typeParameterNames(node), scope), ID_FIELD);
        return;

      case 'TSEnumDeclaration':
        this.visitChildren(node, scope, ID_FIELD);
        return;

      case 'TSEnumMember':
        this.visit(node.initializer, scope);
        return;

      case 'TSMappedType': {
        const name = node.typeParameter?.name;
        this.visitChildren(node, this.withNames(typeof name === 'string' ? [name] : [], scope));
        return;
      }

      case 'TSTypeParameter':
        this.visit(node.constraint, scope);
        this.visit(node.default, scope);
        return;

      case 'TSIndexSignature':
        for (const param of node.parameters ?? []) this.visitPattern(param, scope);
        this.visit(node.typeAnnotation, scope);
        return;

      // `x` in `x is SQL` names a parameter, and `label` in `[label: SQL]` is a label.
      case 'TSTypePredicate':
        this.visit(node.typeAnnotation, scope);
        return;
      case 'TSNamedTupleMember':
        this.visit(node.elementType, scope);
        return;

      case 'ImportDeclaration':
      case 'TSImportEqualsDeclaration':
        // Marked when its scope was set up.
        return;

      case 'ExportNamedDeclaration':
        if (node.source) {
          // `export { eq, sql as s } from 'drizzle-orm'` passes Drizzle's names
          // along. `s` is a name you chose.
          if (isDrizzleSource(node.source)) {
            this.markString(node.source);
            for (const specifier of node.specifiers) {
              if (specifier.local) this.markKey(specifier.local);
            }
          }
        } else if (node.declaration) {
          this.visit(node.declaration, scope);
        } else {
          for (const specifier of node.specifiers) this.visit(specifier.local, scope);
        }
        return;

      case 'ExportAllDeclaration':
        if (isDrizzleSource(node.source)) this.markString(node.source);
        return;

      case 'ImportExpression':
        if (isDrizzleSource(node.source)) this.markString(node.source);
        else this.visit(node.source, scope);
        this.visit(node.options, scope);
        return;

      case 'TSImportType': {
        // `import('drizzle-orm').SQL` in a type.
        const source = node.argument?.type === 'TSLiteralType' ? node.argument.literal : node.argument;
        if (isDrizzleSource(source)) {
          this.markString(source);
          this.markQualifier(node.qualifier);
        }
        this.visit(node.typeArguments ?? node.typeParameters, scope);
        return;
      }

      case 'TSModuleDeclaration':
        // `declare module 'drizzle-orm' { ... }` adds to Drizzle's types.
        if (isDrizzleSource(node.id)) this.markString(node.id);
        this.visit(node.body, scope);
        return;

      case 'MemberExpression':
        this.visit(node.object, scope);
        if (node.computed) this.visit(node.property, scope);
        // `where` in `db.select().from(users).where(...)`, and `text` in `t.text()`
        // after `import * as t from 'drizzle-orm/pg-core'`.
        else if (hasMember(this.shapeOf(node.object, scope), node.property.name)) this.markName(node.property);
        return;

      case 'TSQualifiedName':
        this.visit(node.left, scope);
        // `$inferSelect` in `typeof users.$inferSelect`, and `PgColumn` in `t.PgColumn`.
        if (hasMember(this.entityShape(node.left, scope), node.right.name)) this.markName(node.right);
        return;

      case 'Property':
        // A key in an object, like `eq` in `{ eq: 1 }`, is yours. In `{ eq }` the
        // value is the same text, and that one is a use of `eq`.
        if (node.computed) this.visit(node.key, scope);
        this.visit(node.value, scope);
        return;

      // Labels, `import.meta`, and the tag and attribute names in JSX.
      case 'LabeledStatement':
        this.visit(node.body, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
      case 'JSXIdentifier':
      case 'JSXNamespacedName':
      case 'JSXMemberExpression':
        return;

      default:
        this.visitChildren(node, scope);
    }
  }
}

export function findMarks(text: string, options: Options, context: Context = {}): Result {
  // Saves parsing the many files that never mention Drizzle. One that imports
  // `db` from a file of yours still mentions what it calls on it, like `select`,
  // so that file only counts when it imports something.
  if (!text.includes('drizzle-') && !(context.readImport && /\bimport\b/.test(text))) {
    return { marks: [], complete: true };
  }

  const program = parse(text, options);
  if (!program) return { marks: [], complete: false };

  const session = new Session(context);
  const analysis = new Analysis(program, context.fileName, session, true);
  if (context.fileName) session.analyses.set(context.fileName, analysis);
  analysis.visit(program, null);

  // The same text can be reached twice, as with `eq` in `export { eq } from`.
  const unique = new Map(analysis.marks.map((mark) => [`${mark.start}:${mark.end}`, mark]));
  return {
    marks: [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end),
    complete: true,
  };
}
