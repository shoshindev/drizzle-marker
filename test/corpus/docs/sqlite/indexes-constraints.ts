// From "indexes-constraints" in Drizzle's docs for SQLite, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { int, text, unique } from 'drizzle-orm/sqlite-core';
import { check } from 'drizzle-orm/sqlite-core';
import { primaryKey } from 'drizzle-orm/sqlite-core';
import { foreignKey } from 'drizzle-orm/sqlite-core';
import { index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/libsql';
const db = drizzle(process.env.DB_FILE_NAME!);

{
  const table = sqliteTable('table', {
    int1: integer('int1').default(42),
    int2: integer('int2').default(sql`(abs(42))`)
  });
}

{
  const table = sqliteTable('table', { 
    numInt: integer('numInt').notNull() 
  });
}

{
  const user = sqliteTable('user', {
    id: int('id').unique(),
  });

  const table = sqliteTable('table', {
    id: int('id').unique('custom_name'),
  });

  const composite = sqliteTable('composite_example', {
    id: int('id'),
    name: text('name'),
  }, (t) => [
    unique().on(t.id, t.name),
    unique('custom_name').on(t.id, t.name)
  ]);
}

{
  const users = sqliteTable(
    "users",
    {
      id: int().primaryKey(),
      username: text().notNull(),
      age: int(),
    },
    (table) => [
      check("age_check1", sql`${table.age} > 21`)
    ]
  );
}

{
  const user = sqliteTable("user", {
    id: integer().primaryKey({ autoIncrement: true }),
  })

  const pet = sqliteTable("pet", {
    id: integer().primaryKey(),
  })
}

{
  const user = sqliteTable("user", {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text(),
  });

  const book = sqliteTable("book", {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text(),
  });

  const bookToAuthor = sqliteTable("book_to_author", {
    authorId: integer("author_id"),
    bookId: integer("book_id"),
  }, (table) => [
    primaryKey({ columns: [table.bookId, table.authorId] }),
    // Or PK with custom name
    primaryKey({ name: 'custom_name', columns: [table.bookId, table.authorId] })
  ]);
}

{
  const user = sqliteTable("user", {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text(),
    email: text(),
  }, (table) => [
    index("name_idx").on(table.name),
    uniqueIndex("email_idx").on(table.email),
  ]);
}

{
  // Index declaration reference
  index("name")
    .on(table.name)
    .where(sql`...`)
}
