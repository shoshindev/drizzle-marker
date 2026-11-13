// From "transactions" in Drizzle's docs for MySQL, by the Drizzle team, CC BY 4.0.
// See test/corpus/docs/README.md for what was changed.


import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
const db = drizzle(process.env.DATABASE_URL!);

{
  const db = drizzle()

  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100.00` }).where(eq(users.name, 'Dan'));
    await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100.00` }).where(eq(users.name, 'Andrew'));
  });
}

{
  const db = drizzle()

  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100.00` }).where(eq(users.name, 'Dan'));
    await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100.00` }).where(eq(users.name, 'Andrew'));

    await tx.transaction(async (tx2) => {
      await tx2.update(users).set({ name: "Mr. Dan" }).where(eq(users.name, "Dan"));
    });
  });
}

{
  const db = drizzle()

  await db.transaction(async (tx) => {
    const [account] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(users.name, 'Dan'));
    if (account.balance < 100) {
      // This throws an exception that rollbacks the transaction.
      tx.rollback()
    }

    await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100.00` }).where(eq(users.name, 'Dan'));
    await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100.00` }).where(eq(users.name, 'Andrew'));
  });
}

{
  const db = drizzle()

  const newBalance: number = await db.transaction(async (tx) => {
    await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100.00` }).where(eq(users.name, 'Dan'));
    await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100.00` }).where(eq(users.name, 'Andrew'));

    const [account] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(users.name, 'Dan'));
    return account.balance;
  });
}

{
  const db = drizzle({ schema })

  await db.transaction(async (tx) => {
    await tx.query.users.findMany({
      with: {
        accounts: true
      }
    });
  });
}

{
  await db.transaction(
    async (tx) => {
      await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100.00` }).where(eq(users.name, "Dan"));
      await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100.00` }).where(eq(users.name, "Andrew"));
    }, {
      isolationLevel: "read committed",
      accessMode: "read write",
      withConsistentSnapshot: true,
    }
  );

  interface MySqlTransactionConfig {
    isolationLevel?:
      | "read uncommitted"
      | "read committed"
      | "repeatable read"
      | "serializable";
    accessMode?: "read only" | "read write";
    withConsistentSnapshot?: boolean;
  }
}
