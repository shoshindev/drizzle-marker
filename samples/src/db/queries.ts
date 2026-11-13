import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { posts, users } from './schema';

const db = drizzle(process.env.DATABASE_URL!);

export async function recentPosts(authorId: number, search?: string) {
  const filters: SQL[] = [eq(posts.authorId, authorId)];
  if (search) filters.push(sql`${posts.title} ilike ${'%' + search + '%'}`);

  return db
    .select({ title: posts.title, author: users.name })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(...filters))
    .orderBy(desc(posts.id))
    .limit(10);
}

// A local name that hides an import stays unmarked.
export function byName(eq: (a: string, b: string) => boolean, name: string) {
  return eq(name, 'drizzle');
}
