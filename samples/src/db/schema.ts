import { relations, type InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const posts = t.pgTable('posts', {
  id: t.serial('id').primaryKey(),
  title: t.text('title').notNull(),
  authorId: integer('author_id').references(() => users.id),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export type User = InferSelectModel<typeof users>;
