import { unresolvedLimit } from "./retention.ts";
import * as Schema from "effect/Schema";
import {
  decodeIntent,
  fail,
  Item,
  type Intent,
  type Operation,
  type Session,
} from "./contracts.ts";
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
    if (rows.filter((row) => row.status !== "acknowledged").length >= unresolvedLimit)
      fail("queue_full");
    const items = await tx.all<Item>(
      `SELECT * FROM offline_items WHERE actor = ? AND household = ?
      AND kind = ? AND target = ?`,
      [...scope(session), intent.kind, intent.target],
    );
    if (!items[0]) fail("missing_snapshot");
    const previous = predecessor(rows, intent, items[0]);
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

function predecessor(rows: Operation[], intent: Intent, snapshot: Item) {
  const previous = rows
    .filter((row) => row.kind === intent.kind && row.target === intent.target)
    .at(-1);
  if (!previous || previous.status !== "acknowledged") return previous;
  // Retain an optimistic check→uncheck chain when its acknowledgment raced the
  // second tap. Never rebase onto a partner refresh or an unrelated old receipt.
  if (
    intent.kind !== "groceries.setChecked" ||
    previous.rebase_allowed !== 1 ||
    !previous.wire ||
    previous.result_version !== snapshot.version
  )
    return;
  return includesExpected(rows, previous, intent.expected) ? previous : undefined;
}

function includesExpected(rows: Operation[], latest: Operation, expected: string) {
  let current: Operation | undefined = latest;
  while (current?.status === "acknowledged" && current.wire && current.rebase_allowed === 1) {
    const wire = decodeIntent(JSON.parse(current.wire));
    if (
      wire.expected === expected ||
      decodeIntent(JSON.parse(current.intent)).expected === expected
    )
      return true;
    const parent = rows.find((row) => row.operation === current?.predecessor);
    if (!parent || parent.sequence >= current.sequence || parent.result_version !== wire.expected)
      return false;
    current = parent;
  }
  return false;
}
