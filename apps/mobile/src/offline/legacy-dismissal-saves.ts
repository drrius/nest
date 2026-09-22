import * as Schema from "effect/Schema";
import { SaveLegacyDismissal } from "@nest/contracts/legacy-draft-dismissal";
import { LegacyDismissalSaveAttempt } from "../money/legacy-dismissal-save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(LegacyDismissalSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveLegacyDismissal);
const sameAttempt = Schema.toEquivalence(LegacyDismissalSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM legacy_dismissal_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readLegacyDismissalSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageLegacyDismissalSave(
  db: Database,
  session: Session,
  input: LegacyDismissalSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(LegacyDismissalSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO legacy_dismissal_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearLegacyDismissalSave(
  db: Database,
  session: Session,
  input: LegacyDismissalSaveAttempt,
) {
  const attempt = Schema.decodeUnknownSync(LegacyDismissalSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM legacy_dismissal_save_attempts WHERE actor=? AND household=?",
      keys(session),
    );
  });
}
