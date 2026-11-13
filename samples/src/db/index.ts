import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Imported by queries.ts, whose calls on `sharedDb` get marks too.
export const db = drizzle(process.env.DATABASE_URL!, { schema });
