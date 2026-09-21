import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateSaveAttempt } from "./recurring-state-save-attempt.ts";
export function recurringStateSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRecurringStateSave(account.session),
    stage: (attempt: RecurringStateSaveAttempt, current: () => boolean) =>
      account.store.stageRecurringStateSave(account.session, attempt, current),
    clear: (attempt: RecurringStateSaveAttempt) =>
      account.store.clearRecurringStateSave(account.session, attempt),
    read: (attempt: RecurringStateSaveAttempt) =>
      checked(client.recoverRecurringState(attempt.command)),
    send: (attempt: RecurringStateSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelRecurringStateSave(attempt.command))
        : checked(client.saveRecurringState(attempt.command)).pipe(
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
export type RecurringStateSaveOperations = ReturnType<typeof recurringStateSaveOperations>;
