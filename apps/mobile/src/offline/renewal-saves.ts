import * as Schema from "effect/Schema";
import { RenewalCommand } from "@nest/contracts/renewals";
import { RenewalSaveAttempt } from "../renewals/save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(RenewalSaveAttempt);
const sameCommand = Schema.toEquivalence(RenewalCommand);
const sameAttempt = Schema.toEquivalence(RenewalSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM renewal_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readRenewalSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageRenewalSave(
  db: Database,
  session: Session,
  input: RenewalSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(RenewalSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO renewal_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearRenewalSave(db: Database, session: Session, input: RenewalSaveAttempt) {
  const attempt = Schema.decodeUnknownSync(RenewalSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run("DELETE FROM renewal_save_attempts WHERE actor=? AND household=?", keys(session));
  });
}
