import * as Chores from "./chore-reminder-saves.ts";
import type { ChoreReminderSaveAttempt } from "../chore-reminders/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function choreReminderSaveStore(database: Database) {
  return {
    readChoreReminderSave: (session: Session) =>
      run(() => Chores.readChoreReminderSave(database, session)),
    stageChoreReminderSave: (
      session: Session,
      attempt: ChoreReminderSaveAttempt,
      current: () => boolean,
    ) => run(() => Chores.stageChoreReminderSave(database, session, attempt, current)),
    clearChoreReminderSave: (session: Session, attempt: ChoreReminderSaveAttempt) =>
      run(() => Chores.clearChoreReminderSave(database, session, attempt)),
  };
}
