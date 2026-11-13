// From "column-types" in Drizzle's docs for MySQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { int, mysqlTable } from "drizzle-orm/mysql-core";
import { tinyint } from 'drizzle-orm/mysql-core';
import { smallint } from 'drizzle-orm/mysql-core';
import { mediumint } from 'drizzle-orm/mysql-core';
import { bigint } from 'drizzle-orm/mysql-core';
import { real } from 'drizzle-orm/mysql-core';
import { decimal } from 'drizzle-orm/mysql-core';
import { double } from 'drizzle-orm/mysql-core';
import { float } from 'drizzle-orm/mysql-core';
import { serial } from 'drizzle-orm/mysql-core';
import { binary } from 'drizzle-orm/mysql-core';
import { varbinary } from 'drizzle-orm/mysql-core';
import { blob } from 'drizzle-orm/mysql-core';
import { tinyblob } from 'drizzle-orm/mysql-core';
import { mediumblob } from 'drizzle-orm/mysql-core';
import { longblob } from 'drizzle-orm/mysql-core';
import { char } from 'drizzle-orm/mysql-core';
import { varchar } from 'drizzle-orm/mysql-core';
import { text } from 'drizzle-orm/mysql-core';
import { tinytext } from 'drizzle-orm/mysql-core';
import { mediumtext } from 'drizzle-orm/mysql-core';
import { longtext } from 'drizzle-orm/mysql-core';
import { boolean } from 'drizzle-orm/mysql-core';
import { date } from 'drizzle-orm/mysql-core';
import { datetime } from 'drizzle-orm/mysql-core';
import { year } from 'drizzle-orm/mysql-core';
import { timestamp } from 'drizzle-orm/mysql-core';
import { json } from 'drizzle-orm/mysql-core';
import { mysqlEnum } from 'drizzle-orm/mysql-core';
import { sql } from "drizzle-orm";
import { createId } from '@paralleldrive/cuid2';
import { primaryKey } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
const db = drizzle(process.env.DATABASE_URL!);

{
  const table = mysqlTable('table', {
  	int: int(),
  	int2: int({ unsigned: true })
  });
}

{
  const table = mysqlTable('table', {
  	tinyint: tinyint(),
  	tinyint2: tinyint({ unsigned: true })
  });
}

{
  const table = mysqlTable('table', {
  	smallint: smallint(),
  	smallint2: smallint({ unsigned: true }),
  });
}

{
  const table = mysqlTable('table', {
  	mediumint: mediumint(),
  	mediumint2: mediumint({ unsigned: true })
  });
}

{
  const table = mysqlTable('table', {
  	bigint: bigint({ mode: 'number' }),
  	bigintUnsigned: bigint({ mode: 'number', unsigned: true })
  });

  bigint("...", { mode: 'number' | 'bigint' | 'string' });

  // You can also specify unsigned option for bigint
  bigint("...", { mode: 'number' | 'bigint' | 'string', unsigned: true });
}

{
  const table = mysqlTable('table', {
  	real: real()
  });
}

{
  const table = mysqlTable('table', {
  	realPrecision: real({ precision: 1 }),
  	realPrecisionScale: real({ precision: 1, scale: 1 }),
  });
}

{
  const table = mysqlTable('table', {
  	decimal: decimal(),
  	decimalNum: decimal({ precision: 30, mode: 'number' }),
  	decimalBig: decimal({ precision: 30, mode: 'bigint' }),
  	decimal2: decimal({ precision: 30, scale: 10 }),
  });
}

{
  const table = mysqlTable('table', {
  	double: double()
  });
}

{
  const table = mysqlTable('table', {
  	doublePrecision: double({ precision: 1 }),
  	doublePrecisionScale: double({ precision: 1, scale: 1 })
  });
}

{
  const table = mysqlTable('table', {
  	float: float()
  });
}

{
  const table = mysqlTable('table', {
  	serial: serial()
  });
}

{
  const table = mysqlTable('table', {
  	binary: binary(),
  	binary2: binary({ length: 10 }),
  });
}

{
  const table = mysqlTable('table', {
  	varbinary: varbinary({ length: 2 }),
  });
}

{
  const table = mysqlTable('table', {
  	blob: blob()
  });
}

{
  const table = mysqlTable('table', {
  	tinyblob: tinyblob()
  });
}

{
  const table = mysqlTable('table', {
  	mediumblob: mediumblob()
  });
}

{
  const table = mysqlTable('table', {
  	longblob: longblob()
  });
}

{
  const table = mysqlTable('table', {
  	char: char(),
  });

  // will be inferred as char: "value1" | "value2" | null
  char: char({ enum: ["value1", "value2"] })
}

{
  const table = mysqlTable('table', {
  	varchar: varchar({ length: 2 }),
  });

  // will be inferred as text: "value1" | "value2" | null
  varchar: varchar({ length: 6, enum: ["value1", "value2"] })
}

{
  const table = mysqlTable('table', {
  	text: text(),
  });

  // will be inferred as text: "value1" | "value2" | null
  text: text({ enum: ["value1", "value2"] });
}

{
  const table = mysqlTable('table', {
  	tinytext: tinytext(),
  });

  // will be inferred as tinytext: "value1" | "value2" | null
  tinytext: tinytext({ enum: ["value1", "value2"] });
}

{
  const table = mysqlTable('table', {
  	mediumtext: mediumtext(),
  });

  // will be inferred as mediumtext: "value1" | "value2" | null
  mediumtext: mediumtext({ enum: ["value1", "value2"] });
}

{
  const table = mysqlTable('table', {
  	longtext: longtext(),
  });

  // will be inferred as longtext: "value1" | "value2" | null
  longtext: longtext({ enum: ["value1", "value2"] });
}

{
  const table = mysqlTable('table', {
  	boolean: boolean(),
  });
}

{
  const table = mysqlTable('table', {
  	date: date(),
  });
}

{
  const table = mysqlTable('table', {
  	datetime: datetime({ mode: 'date', fsp: 6 }),
  });
}

{
  const table = mysqlTable('table', {
  	year: year(),
  });
}

{
  const table = mysqlTable('table', {
  	timestamp: timestamp({ mode: 'date', fsp: 6 }),
  });
}

{
  const table = mysqlTable('table', {
  	timestamp: timestamp().defaultNow(),
  });
}

{
  const table = mysqlTable('table', {
  	json: json(),
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
  const table = mysqlTable('table', {
  	popularity: mysqlEnum(['unknown', 'known', 'popular']),
  });
}

{
  type UserId = number & { __brand: "user_id" };
  type Data = {
    foo: string;
    bar: number;
  };

  const users = mysqlTable("users", {
    id: int().$type<UserId>().primaryKey(),
    jsonField: json().$type<Data>(),
  });
}

{
  const table = mysqlTable('table', {
  	int: int().notNull(),
  });
}

{
  const table = mysqlTable("table", {
    int: int().default(3),
    int2: int().default(sql`3`),
  });
}

{
  const table = mysqlTable('table', {
  	id: varchar({ length: 128 }).$defaultFn(() => createId()),
  });
}

{
  const table = mysqlTable('table', {
      alwaysNull: text().$type<string | null>().$onUpdate(() => null),
  });
}

{
  const table = mysqlTable('table', {
  	int: int().primaryKey(),
  });
}

{
  const table = mysqlTable('table', {
  	int: int().autoincrement(),
  });
}
