// From "insert" in Drizzle's docs for MySQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { boolean, int, text, mysqlTable } from 'drizzle-orm/mysql-core';
import { varchar } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { sql } from 'drizzle-orm';
import { QueryBuilder, primaryKey } from 'drizzle-orm/mysql-core';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
const db = drizzle(process.env.DATABASE_URL!);

{
  await db.insert(users).values({ name: 'Andrew' });
}

{
  type NewUser = typeof users.$inferInsert;

  const insertUser = async (user: NewUser) => {
    return db.insert(users).values(user);
  }

  const newUser: NewUser = { name: "Alef" };
  await insertUser(newUser);
}

{
  const usersTable = mysqlTable('users', {
    id: int().autoincrement().primaryKey(),
    name: text().notNull(),
    verified: boolean().notNull().default(false),
  });


  const result = await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).$returningId();
  //    ^? { id: number }[]
}

{
  const usersTableDefFn = mysqlTable('users_default_fn', {
    customId: varchar({ length: 256 }).primaryKey().$defaultFn(createId),
    name: text().notNull(),
  });


  const result = await db.insert(usersTableDefFn).values([{ name: 'John' }, { name: 'John1' }]).$returningId();
  //  ^? { customId: string }[]
}

{
  await db.insert(users).values([{ name: 'Andrew' }, { name: 'Dan' }]);
}

{
  // Note that MySQL automatically determines targets based on the primary key and unique indexes
  await db.insert(users)
    .values({ id: 1, name: 'John' })
    .onDuplicateKeyUpdate({ set: { name: 'John' } });
}

{
  await db.insert(users)
    .values({ id: 1, name: 'John' })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}

{
  const insertedEmployees = await db
    .insert(employees)
    .select(
      db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'employee'))
    );
}

{
  const qb = new QueryBuilder();
  await db.insert(employees).select(
      qb.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'employee'))
  );
}

{
  await db.insert(employees).select(
      () => db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'employee'))
  );
}

{
  await db.insert(employees).select(
      (qb) => qb.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'employee'))
  );
}

{
  await db.insert(employees).select(
      sql`select users.id as id, users.name as name from users where users.role = 'employee'`
  );
}

{
  await db.insert(employees).select(
      () => sql`select users.id as id, users.name as name from users where users.role = 'employee'`
  );
}
