import * as Schema from "effect/Schema";
import { ExpenseApprovalAttempt } from "../money/approval-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(ExpenseApprovalAttempt);
const equivalent = Schema.toEquivalence(ExpenseApprovalAttempt);
const keys = (session: Session, approvalId: string) => [
  session.actor,
  session.household,
  approvalId,
];
async function read(tx: Transaction, session: Session, approvalId: string) {
  if (!Schema.is(ExpenseApprovalAttempt.fields.approvalId)(approvalId)) fail("invalid_input");
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM expense_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
    keys(session, approvalId),
  );
  if (!rows[0]) return null;
  const attempt = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (attempt.approvalId !== approvalId) fail("invalid_input");
  return attempt;
}
export const readExpenseApproval = (db: Database, session: Session, approvalId: string) =>
  scoped(db, session, (tx) => read(tx, session, approvalId));
export function stageExpenseApproval(
  db: Database,
  session: Session,
  input: ExpenseApprovalAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(ExpenseApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (pending && !equivalent(pending, attempt)) fail("pending_edit");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO expense_approval_attempts(actor,household,approval_id,data) VALUES(?,?,?,?)",
      [...keys(session, attempt.approvalId), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearExpenseApproval(
  db: Database,
  session: Session,
  input: ExpenseApprovalAttempt,
) {
  const attempt = Schema.decodeUnknownSync(ExpenseApprovalAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, attempt.approvalId);
    if (!pending) return;
    if (!equivalent(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM expense_approval_attempts WHERE actor=? AND household=? AND approval_id=?",
      keys(session, attempt.approvalId),
    );
  });
}
