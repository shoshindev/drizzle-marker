// From "sql-schema-declaration" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import * as p from "drizzle-orm/pg-core";
import { defineConfig } from "drizzle-kit";
import { snakeCase, camelCase } from 'drizzle-orm/pg-core';
import { drizzle } from "drizzle-orm/node-postgres";
import { pgSchema } from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgEnum, pgTable as table } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";
import { index, primaryKey, serial, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
const db = drizzle(process.env.DATABASE_URL!);

{
  const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    age: integer().notNull(),
    email: varchar().notNull().unique(),
  });
}

{
  const usersTable = pgTable("users", (t) => ({
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    name: t.varchar().notNull(),
    age: t.integer().notNull(),
    email: t.varchar().notNull().unique(),
  }));
}

{
  const usersTable = p.pgTable("users", {
    id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
    name: p.varchar().notNull(),
    age: p.integer().notNull(),
    email: p.varchar().notNull().unique(),
  });
}

{
  defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts'
  })
}

{
  defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema'
  })
}

{
  const users = pgTable('users', {
    id: integer()
  });
}

{
  // schema.ts


  const users = pgTable('users', {
    id: integer(),
    first_name: varchar()
  })
}

{
  // query.ts
  await db.select().from(users);
}

{
  // schema.ts


  const users = pgTable('users', {
    id: integer(),
    firstName: varchar('first_name')
  })
}

{
  // query.ts
  await db.select().from(users);
}

{
  // schema.ts


  const users = snakeCase.table('users', {
    id: serial().primaryKey(),
    fullName: text(),        // → full_name in DB
    createdAt: timestamp(),  // → created_at in DB
  });

  // Available on all entity types:
  snakeCase.table / snakeCase.view / snakeCase.materializedView / snakeCase.schema
  camelCase.table / camelCase.view / camelCase.materializedView / camelCase.schema
}

{
  // db.ts


  const db = drizzle({ connection: process.env.DATABASE_URL })
}

{
  // query.ts
  await db.select().from(users);
}

{
  // columns.helpers.ts
  const timestamps = {
    updated_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
    deleted_at: timestamp(),
  }
}

{
  // users.sql.ts
  const users = pgTable('users', {
    id: integer(),
    ...timestamps
  })
}

{
  // posts.sql.ts
  const posts = pgTable('posts', {
    id: integer(),
    ...timestamps
  })
}

{
  const customSchema = pgSchema('custom');
}

{
  const customSchema = pgSchema('custom');

  const users = customSchema.table('users', {
    id: integer()
  })
}

{
  const rolesEnum = pgEnum("roles", ["guest", "user", "admin"]);

  const users = table(
    "users",
    {
      id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
      firstName: t.varchar("first_name", { length: 256 }),
      lastName: t.varchar("last_name", { length: 256 }),
      email: t.varchar().notNull(),
      invitee: t.integer().references((): AnyPgColumn => users.id),
      role: rolesEnum().default("guest"),
    },
    (table) => [
      t.uniqueIndex("email_idx").on(table.email)
    ]
  );

  const posts = table(
    "posts",
    {
      id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
      slug: t.varchar().$default(() => generateUniqueString(16)),
      title: t.varchar({ length: 256 }),
      ownerId: t.integer("owner_id").references(() => users.id),
    },
    (table) => [
      t.uniqueIndex("slug_idx").on(table.slug),
      t.index("title_idx").on(table.title),
    ]
  );

  const comments = table("comments", {
    id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    text: t.varchar({ length: 256 }),
    postId: t.integer("post_id").references(() => posts.id),
    ownerId: t.integer("owner_id").references(() => users.id),
  });
}

{
  function generateUniqueString(length: number = 12): string {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let uniqueString = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      uniqueString += characters[randomIndex];
    }

    return uniqueString;
  }
}
