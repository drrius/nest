import * as Groceries from "./grocery-reminder-saves.ts";
import type { GroceryReminderSaveAttempt } from "../grocery-reminders/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function groceryReminderSaveStore(database: Database) {
  return {
    readGroceryReminderSave: (session: Session) =>
      run(() => Groceries.readGroceryReminderSave(database, session)),
    stageGroceryReminderSave: (
      session: Session,
      attempt: GroceryReminderSaveAttempt,
      current: () => boolean,
    ) => run(() => Groceries.stageGroceryReminderSave(database, session, attempt, current)),
    clearGroceryReminderSave: (session: Session, attempt: GroceryReminderSaveAttempt) =>
      run(() => Groceries.clearGroceryReminderSave(database, session, attempt)),
  };
}
