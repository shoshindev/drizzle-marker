# Test set

Real Drizzle code, each file with a hand-written list of the marks it should get, in a `.marks` file next to it. Each line of a list names a line of the file and the text of each mark on it, in order:

```
12: select, from, where, eq
```

A string's mark is its text without the quotes. Lines with no marks aren't listed. `test/corpus.test.ts` runs the marker on each file and checks it against the list, cuts each file off at many points as if it were half-typed, and times it.

The lists were written by reading each file and applying the rule in the README to every name and string, without looking at what the marker does. Comments at the top of a list explain the less obvious calls. When the marker and a list disagree, decide by the rule which one is wrong.

More pages of Drizzle's docs, with the marks they got when they were last checked, are in `test/snapshots`.

## horizons

Four files from a SvelteKit app that uses Drizzle with PostgreSQL. `+page.server.js` imports `db` and the tables from `#lib/server/db/...`, through the `imports` in `package.json`, so it tests following an import to another file. `package.json` keeps only what the marker reads.

## docs

Code from Drizzle's documentation, [drizzle-team/drizzle-orm-docs](https://github.com/drizzle-team/drizzle-orm-docs) at commit `55f7f9e`, by the Drizzle team, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Each file holds the TypeScript examples of one page, for PostgreSQL (`pg`), MySQL and SQLite. `pg/rqb.ts` holds the first part of its page.

The examples were changed to make one page into one file that parses:

- Each example sits in its own `{ }` block, so examples that declare the same names don't clash, and `export` is dropped from declarations inside the blocks.
- The imports of all examples are moved to the top of the file, once each. An example whose imports clash with an earlier one is left out.
- The top of each file creates `db` with the page's usual driver, and imports Drizzle's functions that the examples call without importing them, like `eq` and `sql`.
- Placeholders that aren't code, like `drizzle(...)`, become `drizzle()`, and the import path `drizzle-orm/...` becomes the page's usual driver.
- Examples that still don't parse, like ones with `...` in the middle of an object, are left out.
