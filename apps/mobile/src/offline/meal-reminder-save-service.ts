import * as Meals from "./meal-reminder-saves.ts";
import type { MealReminderSaveAttempt } from "../meal-reminders/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function mealReminderSaveStore(database: Database) {
  return {
    readMealReminderSave: (session: Session) =>
      run(() => Meals.readMealReminderSave(database, session)),
    stageMealReminderSave: (
      session: Session,
      attempt: MealReminderSaveAttempt,
      current: () => boolean,
    ) => run(() => Meals.stageMealReminderSave(database, session, attempt, current)),
    clearMealReminderSave: (session: Session, attempt: MealReminderSaveAttempt) =>
      run(() => Meals.clearMealReminderSave(database, session, attempt)),
  };
}
