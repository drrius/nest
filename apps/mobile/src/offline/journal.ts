import * as Schema from "effect/Schema";
import { decodeIntent, fail, Item, type Operation, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
import { scoped } from "./session.ts";

export const scope = (session: Session) => [session.actor, session.household] as const;
export function operations(tx: Transaction, session: Session) {
  return tx.all<Operation>(
    `SELECT * FROM offline_operations
    WHERE actor = ? AND household = ? ORDER BY sequence`,
    scope(session),
  );
}
export function enqueue(database: Database, session: Session, input: unknown) {
  const intent = decodeIntent(input);
  const serialized = JSON.stringify(intent);
  return scoped(database, session, async (tx) => {
    const rows = await operations(tx, session);
    const existing = rows.find((row) => row.operation === intent.operation);
    if (existing) {
      if (existing.intent !== serialized) fail("operation_reused");
      return;
    }
    const items = await tx.all<Item>(
      `SELECT * FROM offline_items WHERE actor = ? AND household = ?
      AND kind = ? AND target = ?`,
      [...scope(session), intent.kind, intent.target],
    );
    if (!items[0]) fail("missing_snapshot");
    const previous = rows
      .filter(
        (row) =>
          row.kind === intent.kind && row.target === intent.target && row.status !== "acknowledged",
      )
      .at(-1);
    await tx.run(
      `INSERT INTO offline_operations
      (actor, household, operation, kind, target, intent, expected, predecessor, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        ...scope(session),
        intent.operation,
        intent.kind,
        intent.target,
        serialized,
        intent.expected,
        previous?.operation ?? null,
      ],
    );
  });
}
export function read(database: Database, session: Session) {
  return scoped(database, session, async (tx) => {
    const items = await tx.all<Item>(
      "SELECT * FROM offline_items WHERE actor = ? AND household = ?",
      scope(session),
    );
    const pending = (await operations(tx, session)).filter((row) => row.status !== "acknowledged");
    return {
      items: items.map((item) => {
        const overlay = pending
          .filter((row) => row.kind === item.kind && row.target === item.target)
          .at(-1);
        if (!overlay) return { ...item, pending: false };
        const intent = decodeIntent(JSON.parse(overlay.intent));
        return {
          ...item,
          value: intent.kind === "chore.complete" || intent.checked ? 1 : 0,
          pending: true,
        };
      }),
      pending,
    };
  });
}
export function saveSnapshot(database: Database, session: Session, items: readonly Item[]) {
  if (!Schema.is(Schema.Array(Item))(items)) fail("invalid_input");
  return scoped(database, session, async (tx) => {
    await tx.run("DELETE FROM offline_items WHERE actor = ? AND household = ?", scope(session));
    for (const item of items) {
      await tx.run("INSERT INTO offline_items VALUES (?, ?, ?, ?, ?, ?)", [
        ...scope(session),
        item.kind,
        item.target,
        item.version,
        item.value,
      ]);
    }
  });
}
