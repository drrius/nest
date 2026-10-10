import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { GroceryReminderClient } from "./client.ts";
import type { GroceryReminderSaveAttempt } from "./save-attempt.ts";
export function groceryReminderSaveOperations(
  account: OfflineAccount,
  client: GroceryReminderClient,
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readGroceryReminderSave(account.session),
    stage: (attempt: GroceryReminderSaveAttempt, current: () => boolean) =>
      account.store.stageGroceryReminderSave(account.session, attempt, current),
    clear: (attempt: GroceryReminderSaveAttempt) =>
      account.store.clearGroceryReminderSave(account.session, attempt),
    read: (attempt: GroceryReminderSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: GroceryReminderSaveAttempt) =>
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
export type GroceryReminderSaveOperations = ReturnType<typeof groceryReminderSaveOperations>;
