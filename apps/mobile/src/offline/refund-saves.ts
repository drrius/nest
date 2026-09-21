import * as Schema from "effect/Schema";
import { SaveRefund } from "@nest/contracts/refund";
import { RefundSaveAttempt } from "../money/refund-save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(RefundSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveRefund);
const sameAttempt = Schema.toEquivalence(RefundSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM refund_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readRefundSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageRefundSave(
  db: Database,
  session: Session,
  input: RefundSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(RefundSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO refund_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearRefundSave(db: Database, session: Session, input: RefundSaveAttempt) {
  const attempt = Schema.decodeUnknownSync(RefundSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run("DELETE FROM refund_save_attempts WHERE actor=? AND household=?", keys(session));
  });
}
