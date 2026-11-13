// From "drizzle-config-file" in Drizzle's docs for MySQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { defineConfig } from "drizzle-kit";
import * as p from "drizzle-orm/mysql-core"
import { int, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
const db = drizzle(process.env.DATABASE_URL!);

{
  defineConfig({
    dialect: "mysql",
    schema: "./src/schema.ts",
    out: "./drizzle",
  });
}

{
  defineConfig({
    dialect: "mysql",
    schema: "./src/schema.ts",
    out: "./drizzle",
  });
}

{
  defineConfig({
    out: "./drizzle",
    dialect: "mysql",
    schema: "./src/schema.ts",

    dbCredentials: {
      url: "mysql://user:password@host:3306/dbname",
    },

    tablesFilter: "*",

    introspect: {
      casing: "camel",
    },

    migrations: {
      table: "__drizzle_migrations__",
    },

    breakpoints: true,
    verbose: true,
  });
}

{
  defineConfig({
    dialect: "mysql",
    schema: "./src/schema/*",
    out: "./drizzle",
  });
}

{
  defineConfig({
    dialect: "mysql", 
  });
}

{
  defineConfig({
    out: "./drizzle", 
  });
}

{
  defineConfig({
    dialect: "mysql",
    dbCredentials: {
      url: "mysql://user:password@host:port/db",
    }
  });
}

{
  defineConfig({
    dialect: "mysql",
    dbCredentials: {
      host: "host",
      port: 3306,
      user: "user",
      password: "password",
      database: "dbname",
      ssl: "...", // can be: string | SslOptions from mysql2
    }
  });
}

{
  defineConfig({
    dialect: "mysql",
    schema: "./src/schema.ts",
    migrations: {
      table: 'my-migrations-table', // `__drizzle_migrations` by default
    },
  });
}

{
  const users = p.mysqlTable("users", {
    id: p.int().primaryKey().autoincrement(),
    firstName: p.varchar("first-name", { length: 255 }),
    lastName: p.varchar("LastName", { length: 255 }),
    email: p.varchar("email", { length: 255 }),
    phoneNumber: p.varchar("phone_number", { length: 255 }),
  });
}

{
  const users = p.mysqlTable("users", {
    id: p.int().primaryKey().autoincrement(),
    "first-name": p.varchar("first-name", { length: 255 }),
    LastName: p.varchar("LastName", { length: 255 }),
    email: p.varchar("email", { length: 255 }),
    phone_number: p.varchar("phone_number", { length: 255 }),
  });
}

{
  defineConfig({
    dialect: "mysql",
    tablesFilter: ["users", "posts", "project1_*"],
  });
}

{
  defineConfig({
    dialect: "mysql",
    verbose: false,
  });
}

{
  defineConfig({
    dialect: "mysql",
    breakpoints: false,
  });
}
