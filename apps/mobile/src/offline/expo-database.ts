import type { SQLiteDatabase } from "expo-sqlite";
import type { Database, Transaction } from "./database.ts";

// The caller owns this connection's lifetime. Never put tokens or private AI data here.
export function expoDatabase(connection: SQLiteDatabase): Database & { idle: () => Promise<void> } {
  let tail = Promise.resolve();
  return {
    idle: () => tail,
    async transaction<T>(body: (tx: Transaction) => Promise<T>): Promise<T> {
      const queued = tail.then(async () => {
        let result: T | undefined;
        await connection.withExclusiveTransactionAsync(async (tx) => {
          result = await body({
            run: async (sql, values = []) => {
              await tx.runAsync(sql, [...values]);
            },
            all: (sql, values = []) => tx.getAllAsync(sql, [...values]),
          });
        });
        return result as T;
      });
      tail = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
  };
}
