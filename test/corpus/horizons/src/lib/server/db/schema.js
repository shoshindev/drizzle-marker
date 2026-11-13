import { pgTable, pgEnum, integer, text, date, boolean, timestamp } from 'drizzle-orm/pg-core';

export const horizonsEnum = pgEnum('horizons', [
	'week',
	'month',
	'quarter',
	'year',
	'decade',
	'lifetime'
]);

export const goals = pgTable('goals', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	title: text().notNull(),
	horizon: horizonsEnum().notNull(),
	periodStart: date('period_start'),
	done: boolean().notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
