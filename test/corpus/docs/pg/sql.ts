// From "sql" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core';
import { usersTable } from './schema'
import { pgTable, primaryKey, serial, text } from 'drizzle-orm/pg-core';
import { count, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  const id = 69;
  await db.execute(sql`select * from ${usersTable} where ${usersTable.id} = ${id}`)
}

{
  const usersTable = pgTable('users', {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
  });

  //  at runtime this values will be mapped same as `text` column is mapped in drizzle
  sql`...`.mapWith(usersTable.name);
}

{
  sql``.mapWith({
  	mapFromDriverValue: (value: any) => {
  		const mappedValue = value;
  		// mapping you want to apply
  		return mappedValue;
  	},
  });
      
  // or
  sql``.mapWith(Number);
}

{
  sql`lower(${usersTable.name})`.as('lower_name')
}

{
  sql.raw(`select * from users where id = ${12}`);
  // vs
  sql`select * from users where id = ${12}`;
}

{
  sql`select * from ${usersTable} where id = ${12}`;
  // vs
  sql`select * from ${usersTable} where id = ${sql.raw(12)}`;
}

{
  const sqlChunks: SQL[] = [];

  sqlChunks.push(sql`select * from users`);

  // some logic

  sqlChunks.push(sql` where `);

  // some logic

  for (let i = 0; i < 5; i++) {
  	sqlChunks.push(sql`id = ${i}`);

  	if (i === 4) continue;
  	sqlChunks.push(sql` or `);
  }

  const finalSql: SQL = sql.fromList(sqlChunks)
}

{
  const sqlChunks: SQL[] = [];

  sqlChunks.push(sql`select * from users`);

  // some logic

  sqlChunks.push(sql`where`);

  // some logic

  for (let i = 0; i < 5; i++) {
  	sqlChunks.push(sql`id = ${i}`);

  if (i === 4) continue;
      sqlChunks.push(sql`or`);
  }

  const finalSql: SQL = sql.join(sqlChunks, sql.raw(' '));
}

{
  const finalSql = sql`select * from users`;

  // some logic

  finalSql.append(sql` where `);

  // some logic

  for (let i = 0; i < 5; i++) {
  	finalSql.append(sql`id = ${i}`);

  	if (i === 4) continue;
  	finalSql.append(sql` or `);
  }
}

{
  const finalSql = sql.empty();

  // some logic

  finalSql.append(sql`select * from users`);

  // some logic

  finalSql.append(sql` where `);

  // some logic

  for (let i = 0; i < 5; i++) {
  	finalSql.append(sql`id = ${i}`);

  	if (i === 4) continue;
  	finalSql.append(sql` or `);
  }
}

{
  const pgDialect = new PgDialect();
  pgDialect.sqlToQuery(sql`select * from ${usersTable} where ${usersTable.id} = ${12}`);
}

{
  await db.select({
      id: usersTable.id,
      lowerName: sql<string>`lower(${usersTable.name})`,
      aliasedName: sql<string>`lower(${usersTable.name})`.as('aliased_column'),
      count: sql<number>`count(*)`.mapWith(Number) 
  }).from(usersTable)
}

{
  const id = 77

  await db.select()
          .from(usersTable)
          .where(sql`${usersTable.id} = ${id}`)
}

{
  const searchParam = "Ale"

  await db.select()
          .from(usersTable)
          .where(sql`to_tsvector('simple', ${usersTable.name}) @@ to_tsquery('simple', ${searchParam})`)
}

{
  await db.select().from(usersTable).orderBy(sql`${usersTable.id} desc nulls first`)
}

{
  await db.select({ 
      projectId: usersTable.projectId,
      count: sql<number>`count(${usersTable.id})`.mapWith(Number)
  }).from(usersTable)
      .groupBy(sql`${usersTable.projectId}`)
      .having(sql`count(${usersTable.id}) > 300`)
}
