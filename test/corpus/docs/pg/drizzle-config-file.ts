// From "drizzle-config-file" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { defineConfig } from "drizzle-kit";
import * as p from "drizzle-orm/pg-core"
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    out: "./drizzle",
  });
}

{
  defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    out: "./drizzle",
  });
}

{
  defineConfig({
    out: "./drizzle",
    dialect: "postgresql",
    schema: "./src/schema.ts",

    driver: "pglite",
    dbCredentials: {
      url: "./database/",
    },

    extensionsFilters: ["postgis"],
    schemaFilter: "public",
    tablesFilter: "*",

    introspect: {
      casing: "camel",
    },

    migrations: {
      table: "__drizzle_migrations__",
      schema: "drizzle",
    },

    entities: {
      roles: {
        provider: '',
        exclude: [],
        include: []
      }
    },

    breakpoints: true,
    verbose: true,
  });
}

{
  defineConfig({
    dialect: "postgresql",
    schema: "./src/schema/*",
    out: "./drizzle",
  });
}

{
  defineConfig({
    dialect: "postgresql", 
  });
}

{
  defineConfig({
    out: "./drizzle", 
  });
}

{
  defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    driver: "aws-data-api",
    dbCredentials: {
      database: "database",
      resourceArn: "resourceArn",
      secretArn: "secretArn",
    },
  });
}

{
  defineConfig({
    dialect: "postgresql",
    dbCredentials: {
      url: "postgres://user:password@host:port/db",
    }
  });
}

{
  // via connection params
  defineConfig({
    dialect: "postgresql",
    dbCredentials: {
      host: "host",
      port: 5432,
      user: "user",
      password: "password",
      database: "dbname",
      ssl: true, // can be boolean | "require" | "allow" | "prefer" | "verify-full" | options from node:tls
    }
  });
}

{
  defineConfig({
    dialect: "postgresql",
    driver: "aws-data-api",
    dbCredentials: {
      database: "database",
      resourceArn: "resourceArn",
      secretArn: "secretArn",
    },
  });
}

{
  defineConfig({
    dialect: "postgresql",
    driver: "pglite",
    dbCredentials: {
      url: "./database/", // database folder path
    }
  });
}

{
  defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    migrations: {
      table: 'my-migrations-table', // `__drizzle_migrations` by default
      schema: 'my_schema', // `drizzle` by default
    },
  });
}

{
  const users = p.pgTable("users", {
    id: p.serial(),
    firstName: p.text("first-name"),
    lastName: p.text("LastName"),
    email: p.text(),
    phoneNumber: p.text("phone_number"),
  });
}

{
  const users = p.pgTable("users", {
    id: p.serial(),
    "first-name": p.text("first-name"),
    LastName: p.text("LastName"),
    email: p.text(),
    phone_number: p.text("phone_number"),
  });
}

{
  defineConfig({
    dialect: "postgresql",
    tablesFilter: ["users", "posts", "project1_*"],
  });
}

{
  defineConfig({
    dialect: "postgresql",
    schemaFilter: ["public", "schema1", "schema2"],
  });
}

{
  defineConfig({
    dialect: "postgresql",
    extensionsFilters: ["postgis"],
  });
}

{
  defineConfig({
    dialect: "postgresql",
    entities: {
      roles: true
    }
  });
}

{
  defineConfig({
    dialect: "postgresql",
    verbose: false,
  });
}

{
  defineConfig({
    dialect: "postgresql",
    breakpoints: false,
  });
}
