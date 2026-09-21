import * as Schema from "effect/Schema";
import { SaveCorrection } from "@nest/contracts/correction";
import { CorrectionSaveAttempt } from "../money/correction-save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(CorrectionSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveCorrection);
const sameAttempt = Schema.toEquivalence(CorrectionSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM correction_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readCorrectionSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageCorrectionSave(
  db: Database,
  session: Session,
  input: CorrectionSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(CorrectionSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO correction_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearCorrectionSave(db: Database, session: Session, input: CorrectionSaveAttempt) {
  const attempt = Schema.decodeUnknownSync(CorrectionSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM correction_save_attempts WHERE actor=? AND household=?",
      keys(session),
    );
  });
}
