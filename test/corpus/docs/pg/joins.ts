// From "joins" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { user } from "./schema";
import { alias } from "drizzle-orm/pg-core";
import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { primaryKey, serial } from 'drizzle-orm/pg-core';
import { eq, gte, sql } from 'drizzle-orm';
const db = drizzle(process.env.DATABASE_URL!);

{
  const users = pgTable("users", {
    id: serial().primaryKey(),
    name: text().notNull(),
    age: integer(),
  });

  const pets = pgTable("pets", {
    id: serial().primaryKey(),
    name: text().notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id),
  });
}

{
  const result = await db.select().from(users).leftJoin(pets, eq(users.id, pets.ownerId))
}

{
  const subquery = db.select().from(pets).where(gte(users.age, 16)).as('userPets')
  const result = await db.select().from(users).leftJoinLateral(subquery, sql`true`)
}

{
  const result = await db.select().from(users).rightJoin(pets, eq(users.id, pets.ownerId))
}

{
  const result = await db.select().from(users).innerJoin(pets, eq(users.id, pets.ownerId))
}

{
  const subquery = db.select().from(pets).where(gte(users.age, 16)).as('userPets')
  const result = await db.select().from(users).innerJoinLateral(subquery, sql`true`)
}

{
  const result = await db.select().from(users).fullJoin(pets, eq(users.id, pets.ownerId))
}

{
  const result = await db.select().from(users).crossJoin(pets)
}

{
  const subquery = db.select().from(pets).where(gte(users.age, 16)).as('userPets')
  const result = await db.select().from(users).crossJoinLateral(subquery)
}

{
  await db.select({
    userId: users.id,
    petId: pets.id,
  }).from(users).leftJoin(pets, eq(users.id, pets.ownerId))
}

{
  const result = await db.select({
    userId: users.id,
    petId: pets.id,
    petName1: sql`upper(${pets.name})`,
    petName2: sql<string | null>`upper(${pets.name})`,
    //˄we should explicitly tell 'string | null' in type, since we're left joining that field
  }).from(users).leftJoin(pets, eq(users.id, pets.ownerId))
}

{
  await db.select({
    userId: users.id,
    userName: users.name,
    pet: {
      id: pets.id,
      name: pets.name,
      upperName: sql<string>`upper(${pets.name})`
    }
  }).from(users).fullJoin(pets, eq(users.id, pets.ownerId))
}

{
  const parent = alias(user, "parent");
  const result = await db
    .select()
    .from(user)
    .leftJoin(parent, eq(parent.id, user.parentId));
}

{
  const user = pgTable("user", {
    id: integer().primaryKey(),
    name: text().notNull(),
    parentId: integer("parent_id").notNull().references((): AnyPgColumn => user.id)
  });
}

{
  const cities = pgTable("cities", {
    id: integer().primaryKey(),
    name: text(),
  });

  const users = pgTable("users", {
    id: integer().primaryKey(),
    name: text(),
    cityId: integer("city_id").references(() => cities.id),
  });

  const db = drizzle(process.env.DATABASE_URL);

  const result = await db.select().from(cities).leftJoin(users, eq(cities.id, users.cityId));
}

{
  const users = pgTable("users", {
    id: integer().primaryKey(),
    name: text(),
  });

  const chatGroups = pgTable("chat_groups", {
    id: integer().primaryKey(),
    name: text(),
  });

  const usersToChatGroups = pgTable("users_to_chat_groups", {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    groupId: integer("group_id")
      .notNull()
      .references(() => chatGroups.id),
  });

  // querying user group with id 1 and all the participants(users)
  await db.select()
    .from(usersToChatGroups)
    .leftJoin(users, eq(usersToChatGroups.userId, users.id))
    .leftJoin(chatGroups, eq(usersToChatGroups.groupId, chatGroups.id))
    .where(eq(chatGroups.id, 1));
}
