# Drizzle Marker

Paints a translucent teal mark, like a highlighter's, behind the names that come from [Drizzle ORM](https://orm.drizzle.team), so you can tell Drizzle's API apart from your own code at a glance.

The rule: a name gets a mark if Drizzle fixes its spelling, so renaming it would break your code, like `pgTable`, `eq` and `InferSelectModel`. A name you choose stays unmarked, even when it holds something of Drizzle's. Here Drizzle means the packages the Drizzle team publishes: `drizzle-orm`, `drizzle-kit`, `drizzle-zod`, `drizzle-valibot`, `drizzle-typebox`, `drizzle-arktype` and `drizzle-seed`.

It only adds a background, so your theme's text colors stay the same and it works with any color theme.

## Install

You need VS Code 1.100 or newer. Drizzle Marker isn't on the Marketplace yet, so build and install it from this repository:

```bash
npm install
npm run vsix
code --install-extension drizzle-marker-0.0.1.vsix
```

Then run **Developer: Reload Window** from the Command Palette.

## Use

Marks appear on their own in TypeScript and JavaScript files, including `.tsx` and `.jsx`. Turn them on and off with **Drizzle Marker: Toggle Marks** in the Command Palette. The setting survives restarts.

Marks also appear in Restricted Mode, which VS Code uses for folders you haven't marked as trusted, because the extension only reads your files and never runs code from them.

## What gets marked

| Group | Examples |
|---|---|
| Imports | the whole of `drizzle-orm/pg-core` and `drizzle-kit` in an import, in `export ... from`, in `await import()`, in `import('drizzle-orm')` in a type, and in `declare module 'drizzle-orm'` |
| Imported names | `pgTable`, `eq`, `sql`, `relations`, `defineConfig`, and types like `SQL` and `InferSelectModel`, in the import and wherever they're used, including in types and in `export { eq } from 'drizzle-orm'` |
| Namespace members | `pgTable` and `text` in `t.pgTable()` and `t.text()` after `import * as t from 'drizzle-orm/pg-core'` |

Some names stay unmarked on purpose. A name you choose for something of Drizzle's is yours: `equals` in `import { eq as equals }`, `t` in `import * as t`, and the name of a default import. So is a local name that hides an import, like `eq` in `function byName(eq) {}`, and a key or member that shares a name with one, like `eq` in `{ eq: 1 }`.

Not marked yet: the methods and options Drizzle fixes, like `primaryKey` in `serial('id').primaryKey()`, `select`, `from` and `where` in `db.select().from(users).where(...)`, `with` in `db.query.users.findMany({ with })`, and `dialect` in `drizzle.config.ts`.

## Color

The marks use teal, `#14B8A6`, at 18% opacity on light themes and 26% on dark. To use another color, add this to your `settings.json`:

```json
"workbench.colorCustomizations": {
  "drizzleMarker.background": "#0066FF26"
}
```

The last two digits set the opacity.

## Develop

| Command | What it does |
|---|---|
| `npm test` | runs the tests in `test/` |
| `npm run check` | checks the types |
| `npm run build` | builds `dist/extension.js` |
| `npm run vsix` | packages the extension into a `.vsix` file |

Press F5 in VS Code to open a second window with the extension loaded and `samples/` open.
