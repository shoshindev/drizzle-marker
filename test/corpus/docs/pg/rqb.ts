// From "rqb" in Drizzle's docs for PostgreSQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.

import { relations } from "./relations";
import { drizzle } from 'drizzle-orm/node-postgres';
import * as p from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm";
import { posts, users } from "./schema";
import { type AnyPgColumn, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { jsonb } from 'drizzle-orm/pg-core';
import { sql } from "drizzle-orm";
import { eq } from 'drizzle-orm';
import { asc, count, desc, placeholder } from 'drizzle-orm';
const db = drizzle(process.env.DATABASE_URL!);

{
  await db.query.posts.findMany({
    orderBy: sql`${posts.id} asc`, // <- ❌ direct table usage
    with: {
      comments: {
        orderBy: sql`${comments.id} desc`, // <- ❌ direct table usage
      },
    },
  });
}

{
  await db.query.users.findMany({
    where: {
      RAW: sql`LOWER(${users.name}) LIKE 'john%'`, // <- ❌ direct table usage
    },
  });
}

{
  await db.query.users.findMany({
    extras: {
      loweredName: sql<string>`lower(${users.name})`, // <- ❌ direct table usage
      totalPostsCount: db.$count(posts, eq(posts.authorId, users.id)),  // <- ❌ direct table usage
    },
  });
}

{
  await db.query.posts.findMany({
    orderBy: (t) => sql`${t.id} asc`, // <- ✅ callback used
    with: {
      comments: {
        orderBy: (t, { desc }) => desc(t.id), // <- ✅ callback used
      },
    },
  });
}

{
  await db.query.users.findMany({
    where: {
      RAW: (t) => sql`LOWER(${t.name}) LIKE 'john%'`, // <- ✅ callback used
    },
  });
}

{
  await db.query.users.findMany({
    extras: {
      loweredName: (t, { sql }) => sql<string>`lower(${t.name})`, // <- ✅ callback used
      totalPostsCount: (t) => db.$count(posts, eq(posts.authorId, t.id)), // <- ✅ callback used
    },
  });
}

{
  const db = drizzle(process.env.DATABASE_URL, { relations });

  const result = await db.query.users.findMany({
    with: {
      posts: true,
    },
  });
}

{
  [{
  	id: 10,
  	name: "Dan",
  	posts: [
  		{
  			id: 1,
  			content: "SQL is awesome",
  			authorId: 10,
  		},
  		{
  			id: 2,
  			content: "But check relational queries",
  			authorId: 10,
  		}
  	]
  }]
}

{
  const relations = defineRelations({ users, posts }, (r) => ({
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
          }),
        },
        users: {
          posts: r.many.posts(),
        },
      }));
}

{
  const db = drizzle(process.env.DATABASE_URL,{ relations });

  await db.query.users.findMany();
}

{
  const users = pgTable('users', {
  	id: integer().primaryKey(),
  	name: text().notNull(),
  	invitedBy: integer('invited_by').references((): AnyPgColumn => users.id),
  });

  const groups = pgTable('groups', {
  	id: integer().primaryKey(),
  	name: text().notNull(),
  	description: text(),
  });

  const usersToGroups = pgTable('users_to_groups', {
  	id: integer().primaryKey(),
  	userId: integer('user_id').notNull().references(() => users.id),
  	groupId: integer('group_id').notNull().references(() => groups.id),
  }, (t) => [
  	primaryKey({ columns: [t.userId, t.groupId] })
  ]);

  const posts = pgTable('posts', {
  	id: integer().primaryKey(),
  	content: text().notNull(),
  	authorId: integer('author_id').references(() => users.id),
  	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  const comments = pgTable('comments', {
  	id: integer().primaryKey(),
  	content: text().notNull(),
  	creator: integer().references(() => users.id),
  	postId: integer('post_id').references(() => posts.id),
  	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  const commentLikes = pgTable('comment_likes', {
  	id: integer().primaryKey(),
  	creator: integer().references(() => users.id),
  	commentId: integer('comment_id').references(() => comments.id),
  	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
}

{
  const relations = defineRelations(schema, (r) => ({
      users: {
        invitee: r.one.users({
          from: r.users.invitedBy,
          to: r.users.id,
        }),
        groups: r.many.groups({
          from: r.users.id.through(r.usersToGroups.userId),
          to: r.groups.id.through(r.usersToGroups.groupId),
        }),
        posts: r.many.posts(),
      },
      groups: {
        users: r.many.users(),
      },
      posts: {
        author: r.one.users({
          from: r.posts.authorId,
          to: r.users.id,
        }),
        comments: r.many.comments(),
      },
      comments: {
        post: r.one.posts({
          from: r.comments.postId,
          to: r.posts.id,
        }),
        author: r.one.users({
          from: r.comments.creator,
          to: r.users.id,
        }),
        likes: r.many.commentLikes(),
      },
      commentLikes: {
        comment: r.one.comments({
          from: r.commentLikes.commentId,
          to: r.comments.id,
        }),
        author: r.one.users({
          from: r.commentLikes.creator,
          to: r.users.id,
        }),
      },
    })
  );
}

{
  const users = await db.query.users.findMany();
}

{
  const user = await db.query.users.findFirst();
}

{
  const posts = await db.query.posts.findMany({
  	with: {
  		comments: true,
  	},
  });
}

{
  const post = await db.query.posts.findFirst({
  	with: {
  		comments: true,
  	},
  });
}

{
  const users = await db.query.users.findMany({
  	with: {
  		posts: {
  			with: {
  				comments: true,
  			},
  		},
  	},
  });
}

{
  const posts = await db.query.posts.findMany({
  	columns: {
  		id: true,
  		content: true,
  	},
  	with: {
  		comments: true,
  	}
  });
}

{
  const posts = await db.query.posts.findMany({
  	columns: {
  		content: false,
  	},
  });
}

{
  const users = await db.query.users.findMany({
  	columns: {
  		name: true,
  		id: false //ignored
  	},
  });
}

{
  const res = await db.query.users.findMany({
  	columns: {},
  	with: {
  		posts: true
  	}
  });
}

{
  const posts = await db.query.posts.findMany({
  	columns: {
  		id: true,
  		content: true,
  	},
  	with: {
  		comments: {
  			columns: {
  				authorId: false
  			}
  		}
  	}
  });
}

{
  const users = await db.query.users.findMany({
  	where: {
  		id: 1
  	}
  });
}

{
  await db.query.posts.findMany({
    where: {
      id: 1,
    },
    with: {
      comments: {
        where: {
          createdAt: { lt: new Date() },
        },
      },
    },
  });
}

{
  const response = await db.query.users.findMany({
    where: {
      age: 15,
    },
  });
}

{
  const response = await db.query.users.findMany({
    where: {
      age: 15,
      name: 'John'
    },
  });
}

{
  const response = await db.query.users.findMany({
    where: {
      OR: [
        {
          id: {
            gt: 10,
          },
        },
        {
          name: {
            like: "John%",
          },
        },
      ],
    },
  });
}

{
  const response = await db.query.users.findMany({
    where: {
      NOT: {
        id: {
          gt: 10,
        },
      },
      name: {
        like: "John%",
      },
    },
  });
}

{
  // schema.ts



  const users = pgTable("users", {
    id: integer("id").primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    age: integer("age"),
    createdAt: timestamp("created_at").defaultNow(),
    lastLogin: timestamp("last_login"),
    subscriptionEnd: timestamp("subscription_end"),
    lastActivity: timestamp("last_activity"),
    preferences: jsonb("preferences"),      // JSON column for user settings/preferences
    interests: text("interests").array(),     // Array column for user interests
  });
}

{
  const response = await db.query.users.findMany({
    where: {
      AND: [
        {
          OR: [
            { RAW: (table) => sql`LOWER(${table.name}) LIKE 'john%'` },
            { name: { ilike: "jane%" } },
          ],
        },
        {
          OR: [
            { RAW: (table) => sql`${table.preferences}->>'theme' = 'dark'` },
            { RAW: (table) => sql`${table.preferences}->>'theme' IS NULL` },
          ],
        },
        { RAW: (table) => sql`${table.age} BETWEEN 25 AND 35` },
      ],
    },
  });
}

{
  const usersWithPosts = await db.query.usersTable.findMany({
    where: {
      id: {
        gt: 10
      },
      posts: {
        content: {
          like: 'M%'
        }
      }
    },
  });
}

{
  const response = await db.query.users.findMany({
    with: {
      posts: true,
    },
    where: {
      posts: true,
    },
  });
}

{
  await db.query.posts.findMany({
  	limit: 5,
  });
}

{
  await db.query.posts.findMany({
  	with: {
  		comments: {
  			limit: 3,
  		},
  	},
  });
}

{
  await db.query.posts.findMany({
  	limit: 5,
  	offset: 2, // correct ✅
  	with: {
  		comments: {
  			offset: 3, // correct ✅
  			limit: 3,
  		},
  	},
  });
}

{
  await db.query.posts.findMany({
  	with: {
  		comments: true,
  	},
    limit: 5,
    offset: 5,
  });
}

{
  await db.query.posts.findMany({
    orderBy: {
      id: "asc",
    },
  });
}

{
  await db.query.posts.findMany({
      orderBy: { id: "asc" },
      with: {
        comments: {
          orderBy: { id: "desc" },
        },
      },
    });
}

{
  await db.query.posts.findMany({
    orderBy: (t) => sql`${t.id} asc`,
    with: {
      comments: {
        orderBy: (t, { desc }) => desc(t.id),
      },
    },
  });
}

{
  await db.query.users.findMany({
    extras: {
      loweredName: (table) => sql`lower(${table.name})`,
    },
  });
}

{
  await db.query.users.findMany({
  	extras: {
  		loweredName: (users, { sql }) => sql`lower(${users.name})`,
  	},
  })
}

{
  const res = await db.query.users.findMany({
  	extras: {
  		fullName: (users, { sql }) => sql<string>`concat(${users.name}, " ", ${users.name})`,
  	},
  	with: {
  		groups: true,
  	},
  });
}

{
  const res = await db.query.posts.findMany({
  	extras: {
  		contentLength: (table, { sql }) => sql<number>`length(${table.content})`,
  	},
  	with: {
  		comments: {
  			extras: {
  				commentSize: (table, { sql }) => sql<number>`length(${table.content})`,
  			},
  		},
  	},
  });
}

{
  await db.query.users.findMany({
    with: {
      posts: true
    },
    extras: {
      totalPostsCount: (table) => db.$count(posts, eq(posts.authorId, table.id)),
    }
  });
}

{
  const prepared = db.query.users.findMany({
      where: { id: { eq: sql.placeholder("id") } },
      with: {
        posts: {
          where: { id: 1 },
        },
      },
  }).prepare("query_name");

  const usersWithPosts = await prepared.execute({ id: 1 });
}

{
  const prepared = db.query.users.findMany({
      with: {
        posts: {
          limit: sql.placeholder("limit"),
        },
      },
    }).prepare("query_name");

  const usersWithPosts = await prepared.execute({ limit: 1 });
}

{
  const prepared = db.query.users.findMany({
  	offset: sql.placeholder('offset'),
  	with: {
  		posts: true,
  	},
  }).prepare('query_name');

  const usersWithPosts = await prepared.execute({ offset: 1 });
}

{
  const prepared = db.query.users.findMany({
      limit: sql.placeholder("uLimit"),
      offset: sql.placeholder("uOffset"),
      where: {
        OR: [{ id: { eq: sql.placeholder("id") } }, { id: 3 }],
      },
      with: {
        posts: {
          where: { id: { eq: sql.placeholder("pid") } },
          limit: sql.placeholder("pLimit"),
        },
      },
  }).prepare("query_name");

  const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 });
}
