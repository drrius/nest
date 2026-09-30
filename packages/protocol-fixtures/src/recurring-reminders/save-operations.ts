import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RecurringReminderClient } from "./client.ts";
import type { RecurringReminderSaveAttempt } from "./save-attempt.ts";
export function recurringReminderSaveOperations(
  account: OfflineAccount,
  client: RecurringReminderClient,
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRecurringReminderSave(account.session),
    stage: (attempt: RecurringReminderSaveAttempt, current: () => boolean) =>
      account.store.stageRecurringReminderSave(account.session, attempt, current),
    clear: (attempt: RecurringReminderSaveAttempt) =>
      account.store.clearRecurringReminderSave(account.session, attempt),
    read: (attempt: RecurringReminderSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: RecurringReminderSaveAttempt) =>
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
export type RecurringReminderSaveOperations = ReturnType<typeof recurringReminderSaveOperations>;
