import * as Schema from "effect/Schema";
import { decodeIntent, fail, type Kind, type Operation, type Session } from "./contracts.ts";
import type { Database } from "./database.ts";
import { operations, scope } from "./journal.ts";
import { scoped } from "./session.ts";

export function prepare(database: Database, session: Session, kind?: Kind) {
  return scoped(database, session, async (tx) => {
    const rows = await operations(tx, session);
    const next = rows.find((row) => (!kind || row.kind === kind) && ready(row, rows));
    if (!next) return null;
    if (next.wire) return decodeIntent(JSON.parse(next.wire));
    const predecessor = rows.find((row) => row.operation === next.predecessor);
    const intent = decodeIntent(JSON.parse(next.intent));
    const version = predecessor?.rebase_allowed === 1 ? predecessor.result_version : null;
    const wire = { ...intent, expected: version ?? next.expected };
    await tx.run(
      `UPDATE offline_operations SET wire = ?
      WHERE actor = ? AND household = ? AND operation = ?`,
      [JSON.stringify(wire), ...scope(session), next.operation],
    );
    return wire;
  });
}
function ready(row: Operation, rows: Operation[]) {
  if (row.status !== "pending") return false;
  if (!row.predecessor) return true;
  return rows.some(
    (previous) => previous.operation === row.predecessor && previous.status === "acknowledged",
  );
}
const Receipt = Schema.Struct({
  operation: Schema.String.check(Schema.isUUID()),
  version: Schema.NonEmptyString,
  value: Schema.Boolean,
  canRebase: Schema.optional(Schema.Boolean),
});
export type Receipt = typeof Receipt.Type;
export function acknowledge(database: Database, session: Session, receipt: Receipt) {
  if (!Schema.is(Receipt)(receipt)) fail("invalid_receipt");
  return scoped(database, session, async (tx) => {
    const row = (await operations(tx, session)).find(
      (item) => item.operation === receipt.operation,
    );
    if (!row?.wire || row.status === "conflict") fail("invalid_receipt");
    const wire = decodeIntent(JSON.parse(row.wire));
    const expectedValue = wire.kind === "chore.complete" || wire.checked;
    if (receipt.value !== expectedValue) fail("invalid_receipt");
    if (row.status === "acknowledged") {
      if (row.result_version !== receipt.version) fail("invalid_receipt");
      return;
    }
    await tx.run(
      `UPDATE offline_operations SET status = 'acknowledged', result_version = ?, rebase_allowed = ?
      WHERE actor = ? AND household = ? AND operation = ?`,
      [receipt.version, receipt.canRebase === false ? 0 : 1, ...scope(session), receipt.operation],
    );
    await tx.run(
      `INSERT INTO offline_items VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(actor, household, kind, target) DO UPDATE SET version = excluded.version, value = excluded.value`,
      [...scope(session), row.kind, row.target, receipt.version, receipt.value ? 1 : 0],
    );
  });
}
export function conflict(
  database: Database,
  session: Session,
  operation: string,
  reason: "changed" | "removed" | "access_revoked",
) {
  return scoped(database, session, async (tx) => {
    const row = (await operations(tx, session)).find((item) => item.operation === operation);
    if (!row?.wire || row.status !== "pending") fail("invalid_receipt");
    await tx.run(
      `UPDATE offline_operations SET status = 'conflict', reason = ?
      WHERE actor = ? AND household = ? AND operation = ?`,
      [reason, ...scope(session), operation],
    );
  });
}
