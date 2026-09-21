import * as Schema from "effect/Schema";
import { SettlementApprovalAttempt } from "../money/settlement-approval-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(SettlementApprovalAttempt);
const equivalent = Schema.toEquivalence(SettlementApprovalAttempt);
const keys = (session: Session, approvalId: string) => [
  session.actor,
  session.household,
  approvalId,
];
async function read(tx: Transaction, session: Session, approvalId: string) {
  if (!Schema.is(SettlementApprovalAttempt.fields.approvalId)(approvalId)) fail("invalid_input");
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM settlement_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
    keys(session, approvalId),
  );
  if (!rows[0]) return null;
  const attempt = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (attempt.approvalId !== approvalId) fail("invalid_input");
  return attempt;
}
export const readSettlementApproval = (db: Database, session: Session, approvalId: string) =>
  scoped(db, session, (tx) => read(tx, session, approvalId));
export function stageSettlementApproval(
  db: Database,
  session: Session,
  input: SettlementApprovalAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(SettlementApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (pending && !equivalent(pending, attempt)) fail("pending_edit");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO settlement_approval_attempts(actor,household,approval_id,data) VALUES(?,?,?,?)",
      [...keys(session, attempt.approvalId), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearSettlementApproval(
  db: Database,
  session: Session,
  input: SettlementApprovalAttempt,
) {
  const attempt = Schema.decodeUnknownSync(SettlementApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (!pending) return;
    if (!equivalent(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM settlement_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
      keys(session, attempt.approvalId),
    );
  });
}
