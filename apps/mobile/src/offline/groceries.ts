import * as Schema from "effect/Schema";
import { Grocery } from "@nest/contracts/groceries";
import { decodeIntent, fail, type Session } from "./contracts.ts";
import type { Database } from "./database.ts";
import { scoped } from "./session.ts";
import { operations, scope } from "./journal.ts";

export function saveGroceries(database: Database, session: Session, groceries: readonly Grocery[]) {
  if (
    !Schema.is(Schema.Array(Grocery))(groceries) ||
    new Set(groceries.map((row) => row.itemId)).size !== groceries.length
  )
    fail("invalid_input");
  return scoped(database, session, async (tx) => {
    await tx.run("DELETE FROM offline_groceries WHERE actor=? AND household=?", scope(session));
    await tx.run(
      "DELETE FROM offline_items WHERE actor=? AND household=? AND kind='groceries.setChecked'",
      scope(session),
    );
    for (const item of groceries) {
      await tx.run("INSERT INTO offline_groceries VALUES(?,?,?,?)", [
        ...scope(session),
        item.itemId,
        JSON.stringify(item),
      ]);
      await tx.run("INSERT INTO offline_items VALUES(?,?,'groceries.setChecked',?,?,?)", [
        ...scope(session),
        item.itemId,
        item.version,
        item.checked ? 1 : 0,
      ]);
    }
    await tx.run(
      "INSERT INTO offline_grocery_sync VALUES(?,?,1) ON CONFLICT(actor,household) DO UPDATE SET loaded=1",
      scope(session),
    );
  });
}
export function readGroceries(database: Database, session: Session) {
  return scoped(database, session, async (tx) => {
    const metadata = await tx.all<{ data: string }>(
      "SELECT data FROM offline_groceries WHERE actor=? AND household=? ORDER BY rowid",
      scope(session),
    );
    const loaded = await tx.all(
      "SELECT 1 FROM offline_grocery_sync WHERE actor=? AND household=?",
      scope(session),
    );
    const items = await tx.all<{ target: string; version: string; value: number }>(
      "SELECT target,version,value FROM offline_items WHERE actor=? AND household=? AND kind='groceries.setChecked'",
      scope(session),
    );
    const pending = (await operations(tx, session)).filter(
      (row) => row.kind === "groceries.setChecked" && row.status !== "acknowledged",
    );
    const canonicalItems = new Map(items.map((row) => [row.target, row]));
    const groceries = metadata.map(({ data }) => {
      const item = Schema.decodeUnknownSync(Grocery)(JSON.parse(data));
      const canonical = canonicalItems.get(item.itemId);
      const waiting = pending.filter((row) => row.target === item.itemId);
      const conflict = waiting.some((row) => row.status === "conflict");
      const latest = waiting.at(-1);
      const intent = latest ? decodeIntent(JSON.parse(latest.intent)) : null;
      const checked =
        !conflict && intent?.kind === "groceries.setChecked"
          ? intent.checked
          : canonical?.value === 1;
      return {
        ...item,
        version: canonical?.version ?? item.version,
        checked,
        pending: waiting.length > 0,
        conflict,
      };
    });
    return { loaded: loaded.length === 1, groceries, pending };
  });
}
