export type Binding = readonly (string | number | null)[];
export interface Transaction {
  run(sql: string, values?: Binding): Promise<void>;
  all<T>(sql: string, values?: Binding): Promise<T[]>;
}
export interface Database {
  transaction<T>(body: (tx: Transaction) => Promise<T>): Promise<T>;
}

export const initialize = (database: Database) =>
  database.transaction(async (tx) => {
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_session (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1), lease TEXT NOT NULL,
      actor TEXT NOT NULL, household TEXT NOT NULL)`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_items (
      actor TEXT NOT NULL, household TEXT NOT NULL, kind TEXT NOT NULL,
      target TEXT NOT NULL, version TEXT NOT NULL, value INTEGER NOT NULL,
      PRIMARY KEY(actor, household, kind, target))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_operations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL,
      kind TEXT NOT NULL, target TEXT NOT NULL, intent TEXT NOT NULL,
      expected TEXT NOT NULL, predecessor TEXT, wire TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'conflict', 'acknowledged')),
      result_version TEXT, reason TEXT,
      UNIQUE(actor, household, operation))`);
  });
