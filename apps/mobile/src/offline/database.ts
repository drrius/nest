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
    await initializeMoney(tx);
    await tx.run(
      `CREATE TABLE IF NOT EXISTS agenda_selection (actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`,
    );
    await tx.run(
      `CREATE TABLE IF NOT EXISTS meal_ingredient_attempts (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,week_start))`,
    );
    await tx.run(
      `CREATE TABLE IF NOT EXISTS meal_proposal_attempts (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,week_start))`,
    );
    await tx.run(
      `CREATE TABLE IF NOT EXISTS offline_planned_recipes (actor TEXT NOT NULL,household TEXT NOT NULL,week_start TEXT NOT NULL,entry_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(actor,household,week_start,entry_id))`,
    );
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_meal_weeks (
      actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(actor,household,week_start))`);
    await tx.run(
      `CREATE TABLE IF NOT EXISTS calendar_selection (actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`,
    );
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_session (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1), lease TEXT NOT NULL,
      actor TEXT NOT NULL, household TEXT NOT NULL)`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_groceries (
      actor TEXT NOT NULL, household TEXT NOT NULL, target TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(actor,household,target))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_grocery_sync (
      actor TEXT NOT NULL, household TEXT NOT NULL, loaded INTEGER NOT NULL,
      PRIMARY KEY(actor,household))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_grocery_edit (
      actor TEXT NOT NULL, household TEXT NOT NULL, command TEXT NOT NULL,
      PRIMARY KEY(actor,household))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_chore_transfers (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(actor,household))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_chores (
      actor TEXT NOT NULL, household TEXT NOT NULL, target TEXT NOT NULL,
      title TEXT NOT NULL, due_date TEXT NOT NULL, assignee TEXT,
      PRIMARY KEY(actor, household, target))`);
    await tx.run(`CREATE TABLE IF NOT EXISTS offline_chore_sync (
      actor TEXT NOT NULL, household TEXT NOT NULL, loaded INTEGER NOT NULL,
      PRIMARY KEY(actor, household))`);
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
    await tx.run(`CREATE INDEX IF NOT EXISTS offline_unresolved_predecessors
      ON offline_operations(actor,household,predecessor) WHERE status<>'acknowledged'`);
    const columns = await tx.all<{ name: string }>("PRAGMA table_info(offline_operations)");
    if (!columns.some((column) => column.name === "rebase_allowed"))
      await tx.run(
        "ALTER TABLE offline_operations ADD COLUMN rebase_allowed INTEGER NOT NULL DEFAULT 0",
      );
  });

async function initializeMoney(tx: Transaction) {
  await tx.run(
    `CREATE TABLE IF NOT EXISTS legacy_adoption_save_attempts (actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`,
  );
  await tx.run(
    `CREATE TABLE IF NOT EXISTS legacy_confirmation_save_attempts (actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`,
  );
  await tx.run(
    `CREATE TABLE IF NOT EXISTS legacy_dismissal_save_attempts (actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`,
  );
  await tx.run(`CREATE TABLE IF NOT EXISTS manual_cycle_save_attempts (
    actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS recurring_state_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS recurring_state_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS variable_cycle_save_attempts (
    actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS recurring_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS correction_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS recurring_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS correction_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS refund_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS settlement_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS expense_save_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS refund_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS settlement_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS expense_approval_attempts (
      actor TEXT NOT NULL, household TEXT NOT NULL, approval_id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY(actor,household,approval_id))`);
  await tx.run(`CREATE TABLE IF NOT EXISTS offline_money_reads (
      actor TEXT NOT NULL,household TEXT NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,data TEXT NOT NULL,
      PRIMARY KEY(actor,household,kind,target))`);
}
