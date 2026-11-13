// From "column-types" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { integer, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { smallint } from 'drizzle-orm/pg-core';
import { bigint } from 'drizzle-orm/pg-core';
import { serial } from 'drizzle-orm/pg-core';
import { smallserial } from 'drizzle-orm/pg-core';
import { bigserial } from 'drizzle-orm/pg-core';
import { boolean } from 'drizzle-orm/pg-core';
import { bytea } from 'drizzle-orm/pg-core';
import { text } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { real } from 'drizzle-orm/pg-core';
import { doublePrecision } from 'drizzle-orm/pg-core';
import { json } from 'drizzle-orm/pg-core';
import { jsonb } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { time } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';
import { date } from 'drizzle-orm/pg-core';
import { interval } from 'drizzle-orm/pg-core';
import { pgEnum } from 'drizzle-orm/pg-core';
import { inet } from 'drizzle-orm/pg-core';
import { cidr } from 'drizzle-orm/pg-core';
import { macaddr } from 'drizzle-orm/pg-core';
import { macaddr8 } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { line, point, primaryKey } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
const db = drizzle(process.env.DATABASE_URL!);

{
  const table = pgTable('table', {
  	int: integer()
  });
}

{
  const table = pgTable('table', {
  	int1: integer().default(10),
  	int2: integer().default(sql`10`)
  });
}

{
  const table = pgTable('table', {
  	smallint: smallint()
  });
}

{
  const table = pgTable('table', {
  	smallint1: smallint().default(10),
  	smallint2: smallint().default(sql`10`)
  });
}

{
  const table = pgTable('table', {
  	bigint: bigint({ mode: 'number' })
  });

  // will be inferred as `number`
  bigint: bigint({ mode: 'number' })

  // will be inferred as `bigint`
  bigint: bigint({ mode: 'bigint' })
}

{
  const table = pgTable('table', {
  	bigint1: bigint({ mode: "number" }).default(10),
  	bigint2: bigint({ mode: "number" }).default(sql`10`),
  });
}

{
  const table = pgTable('table', {
  	serial: serial(),
  });
}

{
  const table = pgTable('table', {
  	smallserial: smallserial(),
  });
}

{
  const table = pgTable('table', {
  	bigserial: bigserial({ mode: 'number' }),
  });
}

{
  const table = pgTable('table', {
  	boolean: boolean(),
  	boolean1: boolean().default(true),
  	boolean2: boolean().default(sql`true`),
  });
}

{
  const table = pgTable('table', {
  	bytea: bytea()
  });
}

{
  const table = pgTable('table', {
  	text: text()
  });

  // will be inferred as text: "value1" | "value2" | null
  text: text({ enum: ["value1", "value2"] })
}

{
  const table = pgTable('table', {
  	numeric1: numeric(),
  	numeric2: numeric({ precision: 100 }),
  	numeric3: numeric({ precision: 100, scale: 20 }),
  	numericNum: numeric({ mode: 'number' }),
  	numericBig: numeric({ mode: 'bigint' }),
  });
}

{
  const table = pgTable('table', {
  	real1: real(),
  	real2: real().default(10.1),
  	real3: real().default(sql`10.1`),
  });
}

{
  const table = pgTable('table', {
  	double1: doublePrecision(),
  	double2: doublePrecision().default(10.1),
  	double3: doublePrecision().default(sql`10.1`),
  });
}

{
  const table = pgTable('table', {
  	json1: json(),
  	json2: json().default({ foo: "bar" }),
  	json3: json().default(sql`'{"foo": "bar"}'`),
  });
}

{
  // will be inferred as { foo: string }
  json: json().$type<{ foo: string }>();

  // will be inferred as string[]
  json: json().$type<string[]>();

  // won't compile
  json: json().$type<string[]>().default({});
}

{
  const table = pgTable('table', {
  	jsonb1: jsonb(),
  	jsonb2: jsonb().default({ foo: "bar" }),
  	jsonb3: jsonb().default(sql`'{"foo": "bar"}'`),
  });
}

{
  // will be inferred as { foo: string }
  jsonb: jsonb().$type<{ foo: string }>();

  // will be inferred as string[]
  jsonb: jsonb().$type<string[]>();

  // won't compile
  jsonb: jsonb().$type<string[]>().default({});
}

{
  const table = pgTable('table', {
  	uuid1: uuid(),
  	uuid2: uuid().defaultRandom(),
  	uuid3: uuid().default('a0ee-bc99-9c0b-4ef8-bb6d-6bb9-bd38-0a11')
  });
}

{
  const table = pgTable('table', {
  	time1: time(),
  	time2: time({ withTimezone: true }),
  	time3: time({ precision: 6 }),
  	time4: time({ precision: 6, withTimezone: true })
  });
}

{
  const table = pgTable('table', {
  	timestamp1: timestamp(),
  	timestamp2: timestamp({ precision: 6, withTimezone: true }),
  	timestamp3: timestamp().defaultNow(),
  	timestamp4: timestamp().default(sql`now()`),
  });
}

{
  const table = pgTable('table', {
  	date: date(),
  });
}

{
  const table = pgTable('table', {
  	interval1: interval(),
  	interval2: interval({ fields: "day to second", precision: 6 }),
  	interval3: interval({ fields: "month" })
  });
}

{
  const items = pgTable('items', {
  	point: point(),
  	pointObj: point({ mode: 'xy' }),
  });
}

{
  const items = pgTable('items', {
  	line: line(),
  	lineObj: line({ mode: 'abc' }),
  });
}

{
  const moodEnum = pgEnum('mood', ['sad', 'ok', 'happy']);

  const table = pgTable('table', {
  	mood: moodEnum(),
  });
}

{
  const table = pgTable('table', {
  	inet: inet(),
  	inet2: inet().default('127.0.0.1')
  });
}

{
  const table = pgTable('table', {
  	cidr: cidr(),
  	cidr2: cidr().default('127.0.0.1/32')
  });
}

{
  const table = pgTable('table', {
  	macaddr: macaddr(),
  	macaddr2: macaddr().default('08:00:2b:01:02:03')
  });
}

{
  const table = pgTable('table', {
  	macaddr8: macaddr8(),
  	macaddr8_2: macaddr8().default('08:00:2b:01:02:03:04:05')
  });
}

{
  type UserId = number & { __brand: 'user_id' };
  type Data = {
  	foo: string;
  	bar: number;
  };

  const users = pgTable('users', {
  	id: serial().$type<UserId>().primaryKey(),
  	jsonField: json().$type<Data>(),
  });
}

{
  const ingredients = pgTable('ingredients', {
  	id: integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1000 }),
  	name: text().notNull(),
  	description: text(),
  });
}

{
  const table = pgTable('table', {
  	integer1: integer().default(42),
  	integer2: integer().default(sql`42`),
  	uuid1: uuid().defaultRandom(),
  	uuid2: uuid().default(sql`gen_random_uuid()`),
  });
}

{
  const table = pgTable('table', {
  	id: text().$defaultFn(() => createId()),
  });
}

{
  const table = pgTable('table', {
  	updateCounter: integer().default(sql`1`).$onUpdateFn((): SQL => sql`${table.update_counter} + 1`),
  	updatedAt: timestamp({ mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
  	alwaysNull: text().$type<string | null>().$onUpdate(() => null),
  });
}

{
  const table = pgTable('table', {
  	integer: integer().notNull(),
  });
}

{
  const table = pgTable('table', {
  	id: serial().primaryKey(),
  });
}
