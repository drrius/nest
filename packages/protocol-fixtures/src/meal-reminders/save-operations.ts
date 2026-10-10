import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MealReminderClient } from "./client.ts";
import type { MealReminderSaveAttempt } from "./save-attempt.ts";
export function mealReminderSaveOperations(account: OfflineAccount, client: MealReminderClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readMealReminderSave(account.session),
    stage: (attempt: MealReminderSaveAttempt, current: () => boolean) =>
      account.store.stageMealReminderSave(account.session, attempt, current),
    clear: (attempt: MealReminderSaveAttempt) =>
      account.store.clearMealReminderSave(account.session, attempt),
    read: (attempt: MealReminderSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: MealReminderSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancel(attempt.command))
        : checked(client.save(attempt.command)).pipe(
            Effect.map((receipt) => ({
              version: 1 as const,
              actorId: receipt.actorId,
              householdId: receipt.householdId,
              operationId: receipt.operationId,
              status: "recorded" as const,
              receipt,
            })),
          ),
  };
}
export type MealReminderSaveOperations = ReturnType<typeof mealReminderSaveOperations>;
