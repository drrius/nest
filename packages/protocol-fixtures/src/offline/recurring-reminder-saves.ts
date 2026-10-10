import * as Schema from "effect/Schema";
import { SaveRecurringReminder } from "@nest/contracts/recurring-reminders";
import { RecurringReminderSaveAttempt } from "../recurring-reminders/save-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(RecurringReminderSaveAttempt);
const sameCommand = Schema.toEquivalence(SaveRecurringReminder);
const sameAttempt = Schema.toEquivalence(RecurringReminderSaveAttempt);
const keys = (session: Session) => [session.actor, session.household];
async function read(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM recurring_reminder_save_attempts WHERE actor=? AND household=?",
    keys(session),
  );
  return rows[0]
    ? Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" })
    : null;
}
export const readRecurringReminderSave = (db: Database, session: Session) =>
  scoped(db, session, (tx) => read(tx, session));
export function stageRecurringReminderSave(
  db: Database,
  session: Session,
  input: RecurringReminderSaveAttempt,
  current: () => boolean,
) {
  const attempt = Schema.decodeUnknownSync(RecurringReminderSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (pending && !sameCommand(pending.command, attempt.command)) fail("pending_edit");
    if (pending?.action === "cancel" && attempt.action === "save") fail("pending_edit");
    if (!pending && attempt.action === "cancel") fail("invalid_input");
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO recurring_reminder_save_attempts(actor,household,data) VALUES(?,?,?)",
      [...keys(session), Schema.encodeSync(codec)(attempt)],
    );
    return attempt;
  });
}
export function clearRecurringReminderSave(
  db: Database,
  session: Session,
  input: RecurringReminderSaveAttempt,
) {
  const attempt = Schema.decodeUnknownSync(RecurringReminderSaveAttempt)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session);
    if (!pending) return;
    if (!sameAttempt(pending, attempt)) fail("operation_reused");
    await tx.run(
      "DELETE FROM recurring_reminder_save_attempts WHERE actor=? AND household=?",
      keys(session),
    );
  });
}
