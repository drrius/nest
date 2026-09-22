import * as Schema from "effect/Schema";
import { SaveLegacyAdoption } from "@nest/contracts/legacy-adoption-command";
import { LegacyAdoptionSaveAttempt } from "../money/legacy-adoption-save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(LegacyAdoptionSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveLegacyAdoption);
const sameAttempt = Schema.toEquivalence(LegacyAdoptionSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM legacy_adoption_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readLegacyAdoptionSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageLegacyAdoptionSave(
  db: Database,
  session: Session,
  input: LegacyAdoptionSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(LegacyAdoptionSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO legacy_adoption_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearLegacyAdoptionSave(
  db: Database,
  session: Session,
  input: LegacyAdoptionSaveAttempt,
) {
  const attempt = Schema.decodeUnknownSync(LegacyAdoptionSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM legacy_adoption_save_attempts WHERE actor=? AND household=?",
      keys(session),
    );
  });
}
