import * as Schema from "effect/Schema";
import { GroceryChange } from "../groceries/edit-contract.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
import { scope } from "./journal.ts";
import { scoped } from "./session.ts";

const decode = Schema.decodeUnknownSync(GroceryChange);
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ command: string }>(
    "SELECT command FROM offline_grocery_edit WHERE actor = ? AND household = ?",
    scope(session),
  );
  return rows[0] ? decode(JSON.parse(rows[0].command)) : null;
}
export const readGroceryChange = (database: Database, session: Session) =>
  scoped(database, session, (tx) => read(tx, session));

// A retained online attempt is retried only by an explicit user action. It never
// enters the offline checking queue or runs during background/foreground sync.
export function stageGroceryChange(database: Database, session: Session, input: GroceryChange) {
  const change = decode(input);
  return scoped(database, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending) {
      if (JSON.stringify(pending) !== JSON.stringify(change)) fail("pending_edit");
      return pending;
    }
    await tx.run("INSERT INTO offline_grocery_edit VALUES (?, ?, ?)", [
      ...scope(session),
      JSON.stringify(change),
    ]);
    return change;
  });
}
export function clearGroceryChange(database: Database, session: Session, operation: string) {
  return scoped(database, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (pending.command.operationId !== operation) fail("operation_reused");
    await tx.run(
      "DELETE FROM offline_grocery_edit WHERE actor = ? AND household = ?",
      scope(session),
    );
  });
}
