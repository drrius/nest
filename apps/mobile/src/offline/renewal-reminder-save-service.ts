import * as Renewals from "./renewal-reminder-saves.ts";
import type { RenewalReminderSaveAttempt } from "../renewal-reminders/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function renewalReminderSaveStore(database: Database) {
  return {
    readRenewalReminderSave: (session: Session) =>
      run(() => Renewals.readRenewalReminderSave(database, session)),
    stageRenewalReminderSave: (
      session: Session,
      attempt: RenewalReminderSaveAttempt,
      current: () => boolean,
    ) => run(() => Renewals.stageRenewalReminderSave(database, session, attempt, current)),
    clearRenewalReminderSave: (session: Session, attempt: RenewalReminderSaveAttempt) =>
      run(() => Renewals.clearRenewalReminderSave(database, session, attempt)),
  };
}
