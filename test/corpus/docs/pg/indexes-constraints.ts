// From "indexes-constraints" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { sql } from "drizzle-orm";
import { integer, uuid, pgTable } from "drizzle-orm/pg-core";
import { text, unique } from 'drizzle-orm/pg-core';
import { check } from 'drizzle-orm/pg-core';
import { serial } from 'drizzle-orm/pg-core';
import { primaryKey } from 'drizzle-orm/pg-core';
import { foreignKey, AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, uniqueIndex } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  const table = pgTable('table', {
    integer1: integer().default(42),
    integer2: integer().default(sql`24`),
    uuid1: uuid().defaultRandom(),
    uuid2: uuid().default(sql`gen_random_uuid()`),
  });
}

{
  const table = pgTable('table', {
    integer: integer().notNull(),
  });
}

{
  const users = pgTable(
    "users",
    {
      id: uuid().defaultRandom().primaryKey(),
      username: text().notNull(),
      age: integer(),
    },
    (table) => [
      check("age_check1", sql`${table.age} > 21`),
    ]
  );
}

{
  const user = pgTable('user', {
    id: serial('id').primaryKey(),
  });

  const table = pgTable('table', {
    id: text('cuid').primaryKey(),
  });
}

{
  const user = pgTable("user", {
    id: serial("id").primaryKey(),
    name: text("name"),
  });

  const book = pgTable("book", {
    id: serial("id").primaryKey(),
    name: text("name"),
  });

  const booksToAuthors = pgTable("books_to_authors", {
    authorId: integer("author_id"),
    bookId: integer("book_id"),
  }, (table) => [
    primaryKey({ columns: [table.bookId, table.authorId] }),
    // Or PK with custom name
    primaryKey({ name: 'custom_name', columns: [table.bookId, table.authorId] }),
  ]);
}

{
  const user = pgTable("user", {
  	id: serial("id"),
  	name: text("name"),
  });

  const book = pgTable("book", {
  	id: serial("id"),
  	name: text("name"),
  	authorId: integer("author_id").references(() => user.id)
  });
}

{
  const user = pgTable("user", {
    id: serial().primaryKey(),
    name: text(),
    email: text(),
  }, (table) => [
    index("name_idx").on(table.name),
    uniqueIndex("email_idx").on(table.email)
  ]);
}
