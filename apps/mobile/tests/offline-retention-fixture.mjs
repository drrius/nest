import { account, grocery } from "./offline-fixture.mjs";
export const id = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedJournal(connection, count, options = {}) {
  const {
    offset = 1,
    actor = account.actor,
    household = account.household,
    status = "acknowledged",
  } = options;
  const insert = connection.prepare(`INSERT INTO offline_operations
    (actor,household,operation,kind,target,intent,expected,predecessor,wire,status,result_version,rebase_allowed)
    VALUES(?,?,?,?,?,?,?,null,?,?,?,1)`);
  connection.exec("BEGIN");
  try {
    for (let index = offset; index < offset + count; index++) {
      const intent = { ...grocery, operation: id(index), target: id(999999) };
      insert.run(
        actor,
        household,
        intent.operation,
        intent.kind,
        intent.target,
        JSON.stringify(intent),
        intent.expected,
        JSON.stringify(intent),
        status,
        status === "acknowledged" ? "v2" : null,
      );
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
export const rows = (connection, actor = account.actor) =>
  connection
    .prepare("SELECT * FROM offline_operations WHERE actor=? AND household=? ORDER BY sequence")
    .all(actor, account.household);
