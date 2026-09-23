import * as Reminders from "./recurring-reminder-saves.ts";
import type { RecurringReminderSaveAttempt } from "../recurring-reminders/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function recurringReminderSaveStore(database: Database) {
  return {
    readRecurringReminderSave: (session: Session) =>
      run(() => Reminders.readRecurringReminderSave(database, session)),
    stageRecurringReminderSave: (
      session: Session,
      attempt: RecurringReminderSaveAttempt,
      current: () => boolean,
    ) => run(() => Reminders.stageRecurringReminderSave(database, session, attempt, current)),
    clearRecurringReminderSave: (session: Session, attempt: RecurringReminderSaveAttempt) =>
      run(() => Reminders.clearRecurringReminderSave(database, session, attempt)),
  };
}
