// What Drizzle's values hold. When you call `integer()`, or read `db.query`, a
// shape says which names on the result are Drizzle's, and what each one holds in
// turn. scripts/generateShapes.ts writes them all, from Drizzle's type files, to
// generatedShapes.json.

import generated from './generatedShapes.json' with { type: 'json' };

export interface Shape {
  // The names Drizzle fixes, each with the shape of what it holds, or null when
  // that's a plain value or something of yours.
  members?: Record<string, Shape | null>;
  // For a module you import from, every export is Drizzle's.
  anyMember?: boolean;
  // Names of yours that hold something of Drizzle's, like the tables your schema
  // file exports. They stay unmarked, but what they hold is known.
  own?: (name: string) => Shape | null;
  // A function: the shape of each argument, whoever writes the function. For
  // `pgTable(name, columns)` you write them, and for the callback relations()
  // takes, Drizzle does.
  args?: (Shape | null)[];
  // What a function returns.
  returns?: Shape | null;
  // A method that returns the value it's called on, like `notNull()`.
  self?: boolean;
  // What each item holds, in a list.
  items?: Shape | null;
  // In an object whose keys are yours, like the columns of a table, the shape of
  // each value.
  anyKey?: Shape | null;
  // The strings it can be, whose text Drizzle fixes, like 'cascade' for `onDelete`.
  values?: string[];
}

interface CompactShape {
  m?: Record<string, number | null>;
  a?: (number | null)[];
  r?: number;
  i?: number;
  k?: number;
  v?: string[];
  s?: 1;
}

const data = generated as unknown as {
  shapes: CompactShape[];
  values: Record<string, Record<string, number>>;
  types: Record<string, Record<string, number>>;
};

// Each shape is turned into its object the first time it's needed, since most
// files only ever touch a few.
const shapes: (Shape | undefined)[] = [];

function shapeAt(index: number | null | undefined): Shape | null {
  if (index === null || index === undefined) return null;
  let shape = shapes[index];
  if (!shape) {
    const compact = data.shapes[index];
    shape = {};
    shapes[index] = shape;
    // Shapes point at each other in circles, so each field is filled in the first
    // time it's read.
    const target = shape;
    const lazy = (field: keyof Shape, read: () => unknown) =>
      Object.defineProperty(target, field, {
        configurable: true,
        enumerable: true,
        get() {
          const value = read();
          Object.defineProperty(target, field, { value, enumerable: true });
          return value;
        },
      });
    const { m, a, r, i, k, v } = compact;
    if (m) lazy('members', () => Object.fromEntries(Object.entries(m).map(([name, ref]) => [name, shapeAt(ref)])));
    if (a) lazy('args', () => a.map(shapeAt));
    if (r !== undefined) lazy('returns', () => shapeAt(r));
    if (i !== undefined) lazy('items', () => shapeAt(i));
    if (k !== undefined) lazy('anyKey', () => shapeAt(k));
    if (v) shape.values = v;
    if (compact.s) shape.self = true;
  }
  return shape;
}

// The official packages, published by the Drizzle team: the ORM with its
// subpaths like drizzle-orm/pg-core, the CLI, the schema validators and the seeder.
export const DRIZZLE_MODULE =
  /^(drizzle-orm|drizzle-kit|drizzle-zod|drizzle-valibot|drizzle-typebox|drizzle-arktype|drizzle-seed)(\/|$)/;

// The listed module an import path belongs to: itself, or the nearest one above
// it, as drizzle-orm/pg-core is for drizzle-orm/pg-core/columns.
function listedModule(path: string, table: Record<string, Record<string, number>>): string | undefined {
  for (let current = path; current; current = current.slice(0, Math.max(0, current.lastIndexOf('/')))) {
    if (Object.hasOwn(table, current)) return current;
  }
  return undefined;
}

// Every name any module exports, for an import from a path the list doesn't
// have, like a file deep inside drizzle-orm.
let anywhere: Map<string, number> | undefined;
function exportedAnywhere(table: Record<string, Record<string, number>>, name: string): number | undefined {
  anywhere ??= new Map();
  if (anywhere.size === 0) {
    for (const exports of Object.values(table)) {
      for (const [item, ref] of Object.entries(exports)) if (!anywhere.has(item)) anywhere.set(item, ref);
    }
  }
  return anywhere.get(name);
}

function lookup(table: Record<string, Record<string, number>>, path: string, name: string): Shape | null {
  const module = listedModule(path, table);
  const ref = module ? table[module][name] : undefined;
  return shapeAt(ref ?? (table === data.values ? exportedAnywhere(table, name) : undefined));
}

// What an export of a Drizzle module holds as a value, like `pgTable`.
export function exportShape(path: string, name: string): Shape | null {
  return lookup(data.values, path, name);
}

// What an export of a Drizzle module describes as a type, like `PgTransaction`.
export function exportTypeShape(path: string, name: string): Shape | null {
  return lookup(data.types, path, name);
}

// A whole module, as `import * as t from 'drizzle-orm/pg-core'` gives it.
export function moduleShape(path: string): Shape {
  return {
    anyMember: true,
    own: (name) => exportShape(path, name),
  };
}

// Is this one of the names Drizzle fixes on a value of this shape?
export function hasMember(shape: Shape | null | undefined, name: string | undefined): boolean {
  if (!shape || name === undefined) return false;
  return Boolean(shape.anyMember) || Object.hasOwn(shape.members ?? {}, name);
}

// What a member holds: one of Drizzle's names, one of yours with a known shape,
// or any key of an object whose keys are yours.
export function memberShape(shape: Shape | null | undefined, name: string | undefined): Shape | null {
  if (!shape || name === undefined) return null;
  const members = shape.members;
  if (members && Object.hasOwn(members, name)) return members[name];
  const own = shape.own?.(name);
  if (own) return own;
  return shape.anyKey ?? null;
}

// Is this one of the strings Drizzle fixes for a value of this shape?
export function hasValue(shape: Shape | null | undefined, text: string): boolean {
  return Boolean(shape?.values?.includes(text));
}
