# Drizzle Marker

Marks the names that come from [Drizzle ORM](https://orm.drizzle.team) in VS Code, so you can tell Drizzle's API apart from your own code at a glance: a teal highlight on dark themes, and a faint highlight with a teal underline on light ones.

The rule: a name or string gets a mark if Drizzle fixes its spelling, so renaming it would break your code, like `pgTable`, `notNull`, `where`, `onDelete` and `'cascade'`. A name you choose stays unmarked, even when it holds something of Drizzle's, like `db`, `users`, a column key like `title`, or a table name like `'period_start'`. Here Drizzle means the packages the Drizzle team publishes: `drizzle-orm`, `drizzle-kit`, `drizzle-zod`, `drizzle-valibot`, `drizzle-typebox`, `drizzle-arktype` and `drizzle-seed`.

It only adds a mark, so your theme's text colors stay the same and it works with any color theme.

## Install

You need VS Code 1.100 or newer. Drizzle Marker isn't on the Marketplace yet, so build and install it from this repository:

```bash
npm install
npm run vsix
code --install-extension drizzle-marker-0.0.1.vsix
```

Then run **Developer: Reload Window** from the Command Palette.

## Use

Marks appear on their own in TypeScript and JavaScript files, including `.tsx` and `.jsx`. When the extension starts, it reads your project's code files once, in the background, to note which of them use Drizzle. A file that neither names Drizzle nor imports one of those files is then ruled out with a single text search. Turn them on and off with **Drizzle Marker: Toggle Marks** in the Command Palette. The setting survives restarts.

Marks also appear in Restricted Mode, which VS Code uses for folders you haven't marked as trusted, because the extension only reads your files and never runs code from them.

## What gets marked

| Group | Examples |
|---|---|
| Imports | the whole of `drizzle-orm/pg-core` and `drizzle-kit` in an import, in `export ... from`, in `await import()`, in `import('drizzle-orm')` in a type, and in `declare module 'drizzle-orm'` |
| Imported names | `pgTable`, `eq`, `sql`, `relations`, `defineConfig`, and types like `SQL` and `InferSelectModel`, wherever they're used, including in types |
| Methods and members | `notNull` and `defaultNow` in `timestamp().notNull().defaultNow()`, `select`, `from`, `leftJoin` and `where` in `db.select().from(users).leftJoin(...).where(...)`, `query` and `findMany` in `db.query.users.findMany()`, `enumValues` on what `pgEnum()` returns, `$inferSelect` in `typeof users.$inferSelect`, `text` in `t.text()` after `import * as t from 'drizzle-orm/pg-core'` |
| Options | `withTimezone` in `timestamp('created_at', { withTimezone: true })`, `onDelete` in `.references(() => users.id, { onDelete: 'cascade' })`, `schema` in `drizzle(client, { schema })`, `columns`, `where`, `with` and `limit` in `findMany({ ... })`, `OR` and `gt` in a 1.0 filter like `where: { OR: [{ id: { gt: 1 } }] }`, and `dialect` and `dbCredentials` in `drizzle.config.ts`, also in a config typed with `satisfies Config` |
| Fixed strings | the text of a string Drizzle fixes, but not its quotes: `cascade` in `onDelete: 'cascade'`, `date` in `mode: 'date'`, `postgresql` in `dialect: 'postgresql'`, `read committed` in `isolationLevel: 'read committed'` |
| Provided names | what Drizzle passes to your callbacks: `one` and `many` in `relations(users, ({ one, many }) => ...)`, `sql` in an `extras` callback like `(table, { sql }) => ...`, and `many` in `r.many.posts()` with `defineRelations` |

Most of these are members of what Drizzle gives you, so the marker follows each value from where it's made: `db` from `drizzle()`, a table from `pgTable()`, and so on. It follows values across your files too, as long as your project's `package.json` lists one of Drizzle's packages:

- `db` and your tables imported from another file, like `$lib/server/db` or `@/db/schema`
- a function of yours that returns `drizzle(...)`, as in `getDb(env.DB).select()`
- a parameter typed with one of Drizzle's types, like `tx: PgTransaction`, or with `typeof db`

Imports are followed through relative paths, the `imports` in `package.json` (like `#lib/...`), `paths` in `tsconfig.json` or `jsconfig.json`, and SvelteKit's `$lib`. Files open in the editor count with their unsaved changes.

Some names stay unmarked on purpose. Your own keys stay clear wherever they are: column keys in `pgTable()`, in `.values({ ... })` and in `.select({ ... })`, relation names in `with: { posts: true }`, and the names of placeholders in `prepared.execute({ limit: 1 })`. So does a name you choose for something of Drizzle's: `database` in `const database = drizzle(url)`, `equals` in `import { eq as equals }`, and `t` in `import * as t`. A local name that hides an import, like `eq` in `function byName(eq) {}`, stays unmarked, and so do the methods every promise has, like `then`.

Names from both the current release, 0.45, and the 1.0 release candidate get marks.

## Color

On dark themes the mark is a teal background, `#14B8A6` at 18% opacity. On light themes it's a faint yellow background, `#FFFF00` at 12%, with a teal line under the text, `#0F766E`. Text on a mark keeps a contrast of at least 4.5:1, the WCAG AA minimum, in VS Code's light, dark and high-contrast themes. On a white background only a pale yellow keeps it: types in Light Modern start at 4.59:1, and any darker or bluer tint would push them below 4.5:1. The line is what makes the mark easy to see there.

To change either, add this to your `settings.json`:

```json
"workbench.colorCustomizations": {
  "drizzleMarker.background": "#0066FF26",
  "drizzleMarker.underline": "#00000000"
}
```

The last two digits of a color set its opacity, and `00` hides it.

## Develop

| Command | What it does |
|---|---|
| `npm test` | runs the tests in `test/` |
| `npm run check` | checks the types |
| `npm run build` | builds `dist/extension.js` |
| `npm run shapes` | reads Drizzle's type files again, after updating any of Drizzle's packages |
| `npm run audit-marks -- <folder>` | runs the marker over a project and lists what got a mark and what didn't, with `--view` to show each file's marks |
| `npm run contrast` | checks that text on a mark stays readable in VS Code's own themes |
| `npm run vsix` | packages the extension into a `.vsix` file |

Press F5 in VS Code to open a second window with the extension loaded and `samples/` open.

The marker reads both versions of Drizzle, installed as `drizzle-orm` and `drizzle-orm-1`, and the other packages, and writes what their values hold to `src/generatedShapes.json`. `test/shapes.test.ts` fails when an update to any of them adds or renames an export, until you run `npm run shapes`. `test/corpus` holds real Drizzle code, from Drizzle's documentation and from a SvelteKit app, with a hand-written list of the marks each file should get. See its README. `test/snapshots` holds more of the documentation, with the marks each file last got.
