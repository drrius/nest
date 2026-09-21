import * as Schema from "effect/Schema";
import { SaveSettlement } from "@nest/contracts/settlement";
import { SettlementSaveAttempt } from "../money/settlement-save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(SettlementSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveSettlement);
const sameAttempt = Schema.toEquivalence(SettlementSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM settlement_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readSettlementSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageSettlementSave(
  db: Database,
  session: Session,
  input: SettlementSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(SettlementSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO settlement_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearSettlementSave(db: Database, session: Session, input: SettlementSaveAttempt) {
  const attempt = Schema.decodeUnknownSync(SettlementSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM settlement_save_attempts WHERE actor=? AND household=?",
      keys(session),
    );
  });
}
