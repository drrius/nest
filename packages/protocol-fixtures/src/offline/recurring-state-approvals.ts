import * as Schema from "effect/Schema";
import { RecurringStateApprovalAttempt } from "../money/recurring-state-approval-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(RecurringStateApprovalAttempt);
const equivalent = Schema.toEquivalence(RecurringStateApprovalAttempt);
const keys = (session: Session, approvalId: string) => [
  session.actor,
  session.household,
  approvalId,
];
async function read(tx: Transaction, session: Session, approvalId: string) {
  if (!Schema.is(RecurringStateApprovalAttempt.fields.approvalId)(approvalId))
    fail("invalid_input");
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM recurring_state_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
    keys(session, approvalId),
  );
  if (!rows[0]) return null;
  const attempt = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (attempt.approvalId !== approvalId) fail("invalid_input");
  return attempt;
}
export const readRecurringStateApproval = (db: Database, session: Session, approvalId: string) =>
  scoped(db, session, (tx) => read(tx, session, approvalId));
export function stageRecurringStateApproval(
  db: Database,
  session: Session,
  input: RecurringStateApprovalAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(RecurringStateApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (pending && !equivalent(pending, attempt)) fail("pending_edit");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO recurring_state_approval_attempts(actor,household,approval_id,data) VALUES(?,?,?,?)",
      [...keys(session, attempt.approvalId), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearRecurringStateApproval(
  db: Database,
  session: Session,
  input: RecurringStateApprovalAttempt,
) {
  const attempt = Schema.decodeUnknownSync(RecurringStateApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (!pending) return;
    if (!equivalent(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM recurring_state_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
      keys(session, attempt.approvalId),
    );
  });
}

// Explicit monotonic revocation only. Normal staging can never turn it back into approval.
export function withdrawRecurringStateApproval(
  db: Database,
  session: Session,
  input: RecurringStateApprovalAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(RecurringStateApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (!attempt.approved || !pending || pending.operationId !== attempt.operationId)
      fail("operation_reused");
    if (!current()) fail("cancelled");
    const revoked = { ...attempt, approved: false };
    await tx.run(
      "UPDATE recurring_state_approval_attempts SET data=? WHERE actor=? AND household=? AND approval_id=?",
      [Schema.encodeSync(codec)(revoked), ...keys(session, attempt.approvalId)],
    );
    return revoked;
  });
}
