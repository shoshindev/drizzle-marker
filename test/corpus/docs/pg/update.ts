// From "update" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.


import { alias } from 'drizzle-orm/pg-core';
import { and, avg, eq, lt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  await db.update(users).set({ name: "Mr. Dan" }).where(eq(users.name, "Dan"));
}

{
  await db.update(users)
    .set({ name: 'Mr. Dan' })
    .where(eq(users.name, 'Dan'));
}

{
  await db.update(users)
    .set({ name: null })
    .where(eq(users.name, 'Dan'));
}

{
  await db.update(users)
    .set({ updatedAt: sql`NOW()` })
    .where(eq(users.name, 'Dan'));
}

{
  const updatedUserId = await db.update(users).set({ name: "Mr. Dan" }).where(eq(users.name, "Dan")).returning({ updatedId: users.id });
  //      ^ { updatedId: number | null }[]
}

{
  const averagePrice = db.$with('average_price').as(
  	db.select({ value: sql`avg(${products.price})`.as('value') }).from(products)
  );

  const result = await db.with(averagePrice)
  	.update(products)
  	.set({
  		cheap: true
  	})
  	.where(lt(products.price, sql`(select * from ${averagePrice})`))
  	.returning({
  		id: products.id
  	});
}

{
  await db
    .update(users)
    .set({ cityId: cities.id })
    .from(cities)
    .where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
}

{
  const c = alias(cities, 'c');
  await db
    .update(users)
    .set({ cityId: c.id })
    .from(c);
}

{
  const updatedUsers = await db
    .update(users)
    .set({ cityId: cities.id })
    .from(cities)
    .returning({ id: users.id, cityName: cities.name });
}
