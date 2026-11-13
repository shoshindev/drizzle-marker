// From "insert" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.


import { QueryBuilder } from 'drizzle-orm/pg-core';
import { count, eq, name, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  await db.insert(users).values({ name: 'Andrew' });
}

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
  await db.insert(users).values({ name: "Dan" }).returning();

  // partial return
  await db.insert(users).values({ name: "Partial Dan" }).returning({ insertedId: users.id });
}

{
  await db.insert(users).values([{ name: 'Andrew' }, { name: 'Dan' }]);
}

{
  await db.insert(users)
    .values({ id: 1, name: 'John' })
    .onConflictDoNothing();

  // explicitly specify conflict target
  await db.insert(users)
    .values({ id: 1, name: 'John' })
    .onConflictDoNothing({ target: users.id });
}

{
  await db.insert(users)
    .values({ id: 1, name: 'Dan' })
    .onConflictDoUpdate({ target: users.id, set: { name: 'John' } });
}

{
  await db.insert(employees)
    .values({ employeeId: 123, name: 'John Doe' })
    .onConflictDoUpdate({
      target: employees.employeeId,
      targetWhere: sql`name <> 'John Doe'`,
      set: { name: sql`excluded.name` }
    });

  await db.insert(employees)
    .values({ employeeId: 123, name: 'John Doe' })
    .onConflictDoUpdate({
      target: employees.employeeId,
      set: { name: 'John Doe' },
      setWhere: sql`name <> 'John Doe'`
    });
}

{
  await db.insert(users)
    .values({ firstName: 'John', lastName: 'Doe' })
    .onConflictDoUpdate({
      target: [users.firstName, users.lastName],
      set: { firstName: 'John1' }
    });
}

{
  const userCount = db.$with('user_count').as(
  	db.select({ value: sql`count(*)`.as('value') }).from(users)
  );

  const result = await db.with(userCount)
  	.insert(users)
  	.values([
  		{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` }
  	])
  	.returning({
  		admin: users.admin
  	});
}

{
  const insertedEmployees = await db
    .insert(employees)
    .select(
      db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'employee'))
    )
    .returning({
      id: employees.id,
      name: employees.name
    });
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
      sql`select "users"."id" as "id", "users"."name" as "name" from "users" where "users"."role" = 'employee'`
  );
}

{
  await db.insert(employees).select(
      () => sql`select "users"."id" as "id", "users"."name" as "name" from "users" where "users"."role" = 'employee'`
  );
}
