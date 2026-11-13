# Changelog

## 0.0.1

- Marks the names Drizzle fixes: the import paths of its packages and the names imported from them, the methods and members of what Drizzle returns, like `notNull` and `where`, the options you pass, like `onDelete`, the strings Drizzle fixes, like `'cascade'`, and the names Drizzle passes to your callbacks, like `one` and `many`.
- Follows `db` and your tables from other files of yours, through relative paths, `#imports`, tsconfig `paths`, `$lib` and your monorepo's own packages, like `@repo/db`.
- Knows the names of both the current release, 0.45, and the 1.0 release candidate.
- A translucent teal background behind each mark, which leaves your theme's text colors as they are.
- Reads your project once at startup to note which files use Drizzle, so any other file costs one text search.
