// Finds Drizzle's names in a file.
//
// This file knows nothing about VS Code: text goes in, positions come out.
// That keeps it easy to test (see test/findMarks.test.ts).
//
// acorn parses the file into a tree of "nodes": one for each import, function,
// call, name and so on. Its TypeScript plugin, the one Svelte uses, teaches it
// TypeScript and JSX. We walk that tree and note where Drizzle's names are.

import { Parser } from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';

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

// A node of the tree. Each kind has its own fields, so they stay loose here.
type Node = { type: string; start: number; end: number; [field: string]: any };

// The official packages, published by the Drizzle team: the ORM with its
// subpaths like drizzle-orm/pg-core, the CLI, the schema validators and the seeder.
const DRIZZLE_MODULE =
  /^(drizzle-orm|drizzle-kit|drizzle-zod|drizzle-valibot|drizzle-typebox|drizzle-arktype|drizzle-seed)(\/|$)/;

// What a name holds where it's used. `named` is a name imported from Drizzle
// under its own spelling, like `eq`. `namespace` is a whole Drizzle module, as
// `import * as t from 'drizzle-orm/pg-core'` gives it. null is a name of yours,
// including one that hides an import of the same name, like `eq` in `(eq) => eq`.
type Binding = 'named' | 'namespace' | null;

// The names one function, block or file declares, and the scope around it.
interface Scope {
  names: Map<string, Binding>;
  parent: Scope | null;
}

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

function isDrizzleSource(node: Node | null | undefined): node is Node {
  return node?.type === 'Literal' && typeof node.value === 'string' && DRIZZLE_MODULE.test(node.value);
}

function lookup(name: string, scope: Scope | null): Binding | undefined {
  for (let current = scope; current; current = current.parent) {
    if (current.names.has(name)) return current.names.get(name);
  }
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

export function findMarks(text: string, options: Options): Result {
  // Saves parsing the many files that never mention Drizzle.
  if (!text.includes('drizzle-')) return { marks: [], complete: true };

  let program: Node;
  try {
    program = parserFor(options).parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // The TypeScript plugin refuses to run without line and column numbers.
      locations: true,
      allowHashBang: true,
    }) as unknown as Node;
  } catch {
    return { marks: [], complete: false };
  }

  const marks: Mark[] = [];

  function add(start: number, end: number) {
    if (start >= 0 && start < end) marks.push({ start, end });
  }

  // Only the name, not a type that follows it, like `: string` after a parameter.
  function markName(node: Node) {
    add(node.start, node.start + node.name.length);
  }

  // The text of a string without its quotes: `drizzle-orm` in 'drizzle-orm'.
  function markString(node: Node) {
    add(node.start + 1, node.end - 1);
  }

  function markNameOrString(node: Node) {
    if (node.type === 'Identifier') markName(node);
    else if (node.type === 'Literal') markString(node);
  }

  // `SQL` in `import('drizzle-orm').SQL`, and each part of `a.b.C`.
  function markQualifier(node: Node | null | undefined) {
    if (node?.type === 'Identifier') markName(node);
    else if (node?.type === 'TSQualifiedName') {
      markQualifier(node.left);
      markName(node.right);
    }
  }

  function isNamespace(node: Node, scope: Scope | null): boolean {
    return node.type === 'Identifier' && lookup(node.name, scope) === 'namespace';
  }

  // Notes the names an import declares, and marks the Drizzle parts of it.
  function declareImport(node: Node, names: Map<string, Binding>) {
    const fromDrizzle = isDrizzleSource(node.source);
    if (fromDrizzle) markString(node.source);
    for (const specifier of node.specifiers) {
      const local: string = specifier.local.name;
      if (!fromDrizzle) {
        names.set(local, null);
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        // `t` in `import * as t` is a name you chose, but what it holds is Drizzle's.
        names.set(local, 'namespace');
      } else if (specifier.type === 'ImportSpecifier') {
        markNameOrString(specifier.imported);
        // `equals` in `import { eq as equals }` is a name you chose, so it and
        // its uses stay unmarked.
        const ownSpelling = specifier.imported.type === 'Identifier' && specifier.imported.name === local;
        names.set(local, ownSpelling ? 'named' : null);
        if (ownSpelling) markName(specifier.local);
      } else {
        // A default import's name is yours too.
        names.set(local, null);
      }
    }
  }

  // Notes the names a statement declares in its scope.
  function declare(node: Node | null | undefined, names: Map<string, Binding>) {
    switch (node?.type) {
      case 'ImportDeclaration':
        declareImport(node, names);
        break;
      case 'TSImportEqualsDeclaration': {
        // `import d = require('drizzle-orm')` gives the whole module, like `import * as`.
        const reference = node.moduleReference;
        const fromDrizzle =
          reference?.type === 'TSExternalModuleReference' && isDrizzleSource(reference.expression);
        if (fromDrizzle) markString(reference.expression);
        names.set(node.id.name, fromDrizzle ? 'namespace' : null);
        break;
      }
      case 'VariableDeclaration':
        // `var` belongs to the whole function, but noting it in its block is close
        // enough: it only matters for a `var` that hides an import of the same name.
        for (const declarator of node.declarations) {
          for (const name of patternNames(declarator.id)) names.set(name, null);
        }
        break;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
      case 'TSDeclareFunction':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
      case 'TSEnumDeclaration':
      case 'TSModuleDeclaration':
        if (node.id?.type === 'Identifier') names.set(node.id.name, null);
        break;
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        declare(node.declaration, names);
        break;
    }
  }

  function withNames(names: Iterable<string>, scope: Scope | null): Scope | null {
    const map = new Map<string, Binding>();
    for (const name of names) map.set(name, null);
    return map.size === 0 ? scope : { names: map, parent: scope };
  }

  function withDeclarations(statements: Node[], scope: Scope | null): Scope | null {
    const names = new Map<string, Binding>();
    for (const statement of statements) declare(statement, names);
    return names.size === 0 ? scope : { names, parent: scope };
  }

  function visitStatements(statements: Node[], scope: Scope | null) {
    const inner = withDeclarations(statements, scope);
    for (const statement of statements) visit(statement, inner);
  }

  // Walks every child node except the fields in `skip`.
  function visitChildren(node: Node, scope: Scope | null, skip: Set<string> = NO_FIELDS) {
    for (const field in node) {
      if (POSITION_FIELDS.has(field) || skip.has(field)) continue;
      const value = node[field];
      if (Array.isArray(value)) {
        for (const item of value) visit(item, scope);
      } else {
        visit(value, scope);
      }
    }
  }

  // Walks the parts of a pattern that are code, like the default in `a = eq`
  // and the type in `a: SQL`. The names it declares aren't uses of anything.
  function visitPattern(node: Node | null | undefined, scope: Scope | null) {
    if (!node) return;
    switch (node.type) {
      case 'Identifier':
        break;
      case 'ObjectPattern':
        for (const property of node.properties) {
          if (property.type === 'RestElement') {
            visitPattern(property, scope);
          } else {
            if (property.computed) visit(property.key, scope);
            visitPattern(property.value, scope);
          }
        }
        break;
      case 'ArrayPattern':
        for (const element of node.elements) visitPattern(element, scope);
        break;
      case 'AssignmentPattern':
        visitPattern(node.left, scope);
        visit(node.right, scope);
        break;
      case 'RestElement':
        visitPattern(node.argument, scope);
        break;
      case 'TSParameterProperty':
        visitPattern(node.parameter, scope);
        break;
      default:
        // Something being assigned to, like `a.b` in `[a.b] = list`.
        visit(node, scope);
        return;
    }
    visit(node.typeAnnotation, scope);
    for (const decorator of node.decorators ?? []) visit(decorator, scope);
  }

  function visit(node: Node | null | undefined, scope: Scope | null) {
    if (!node || typeof node.type !== 'string') return;

    if (FUNCTION_NODES.has(node.type)) {
      // A method's name, like `m` in `{ m(): void }`, is yours unless it's computed.
      if (node.computed) visit(node.key, scope);
      const params: Node[] = node.params ?? node.parameters ?? [];
      const names = [...typeParameterNames(node), ...params.flatMap(patternNames)];
      // A function expression's own name can only be used inside it.
      if (node.type === 'FunctionExpression' && node.id) names.push(node.id.name);
      const inner = withNames(names, scope);
      visit(node.typeParameters, inner);
      for (const param of params) visitPattern(param, inner);
      visit(node.returnType ?? node.typeAnnotation, inner);
      visit(node.body, inner);
      return;
    }

    if (KEYED_MEMBERS.has(node.type)) {
      visitChildren(node, scope, node.computed ? NO_FIELDS : KEY_FIELD);
      return;
    }

    switch (node.type) {
      case 'Identifier':
        if (lookup(node.name, scope) === 'named') markName(node);
        return;

      case 'Program':
      case 'BlockStatement':
      case 'StaticBlock':
      case 'TSModuleBlock':
        visitStatements(node.body, scope);
        return;

      case 'SwitchStatement': {
        visit(node.discriminant, scope);
        const inner = withDeclarations(
          node.cases.flatMap((switchCase: Node) => switchCase.consequent),
          scope,
        );
        for (const switchCase of node.cases) {
          visit(switchCase.test, inner);
          for (const statement of switchCase.consequent) visit(statement, inner);
        }
        return;
      }

      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        visitChildren(node, withDeclarations([node.init ?? node.left], scope));
        return;

      case 'CatchClause': {
        const inner = withNames(patternNames(node.param), scope);
        visitPattern(node.param, inner);
        visit(node.body, inner);
        return;
      }

      case 'VariableDeclarator':
        visitPattern(node.id, scope);
        visit(node.init, scope);
        return;

      case 'ClassDeclaration':
      case 'ClassExpression': {
        const names = typeParameterNames(node);
        if (node.type === 'ClassExpression' && node.id) names.push(node.id.name);
        visitChildren(node, withNames(names, scope), ID_FIELD);
        return;
      }

      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        visitChildren(node, withNames(typeParameterNames(node), scope), ID_FIELD);
        return;

      case 'TSEnumDeclaration':
        visitChildren(node, scope, ID_FIELD);
        return;

      case 'TSEnumMember':
        visit(node.initializer, scope);
        return;

      case 'TSMappedType': {
        const name = node.typeParameter?.name;
        visitChildren(node, withNames(typeof name === 'string' ? [name] : [], scope));
        return;
      }

      case 'TSTypeParameter':
        visit(node.constraint, scope);
        visit(node.default, scope);
        return;

      case 'TSIndexSignature':
        for (const param of node.parameters ?? []) visitPattern(param, scope);
        visit(node.typeAnnotation, scope);
        return;

      // `x` in `x is SQL` names a parameter, and `label` in `[label: SQL]` is a label.
      case 'TSTypePredicate':
        visit(node.typeAnnotation, scope);
        return;
      case 'TSNamedTupleMember':
        visit(node.elementType, scope);
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
            markString(node.source);
            for (const specifier of node.specifiers) {
              if (specifier.local) markNameOrString(specifier.local);
            }
          }
        } else if (node.declaration) {
          visit(node.declaration, scope);
        } else {
          for (const specifier of node.specifiers) visit(specifier.local, scope);
        }
        return;

      case 'ExportAllDeclaration':
        if (isDrizzleSource(node.source)) markString(node.source);
        return;

      case 'ImportExpression':
        if (isDrizzleSource(node.source)) markString(node.source);
        else visit(node.source, scope);
        visit(node.options, scope);
        return;

      case 'TSImportType': {
        // `import('drizzle-orm').SQL` in a type.
        const source = node.argument?.type === 'TSLiteralType' ? node.argument.literal : node.argument;
        if (isDrizzleSource(source)) {
          markString(source);
          markQualifier(node.qualifier);
        }
        visit(node.typeArguments ?? node.typeParameters, scope);
        return;
      }

      case 'TSModuleDeclaration':
        // `declare module 'drizzle-orm' { ... }` adds to Drizzle's types.
        if (isDrizzleSource(node.id)) markString(node.id);
        visit(node.body, scope);
        return;

      case 'MemberExpression':
        visit(node.object, scope);
        if (node.computed) visit(node.property, scope);
        // `text` in `t.text()` after `import * as t from 'drizzle-orm/pg-core'`.
        else if (isNamespace(node.object, scope)) markName(node.property);
        return;

      case 'TSQualifiedName':
        visit(node.left, scope);
        if (isNamespace(node.left, scope)) markName(node.right);
        return;

      case 'Property':
        // A key in an object, like `eq` in `{ eq: 1 }`, is yours. In `{ eq }` the
        // value is the same text, and that one is a use of `eq`.
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;

      // Labels, `import.meta`, and the tag and attribute names in JSX.
      case 'LabeledStatement':
        visit(node.body, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
      case 'JSXIdentifier':
      case 'JSXNamespacedName':
      case 'JSXMemberExpression':
        return;

      default:
        visitChildren(node, scope);
    }
  }

  visit(program, null);

  // The same text can be reached twice, as with `eq` in `export { eq } from`.
  const unique = new Map(marks.map((mark) => [`${mark.start}:${mark.end}`, mark]));
  return {
    marks: [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end),
    complete: true,
  };
}
