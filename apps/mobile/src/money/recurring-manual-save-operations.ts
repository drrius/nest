import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { ManualCycleSaveAttempt } from "./recurring-manual-save-attempt.ts";
export function manualCycleSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readManualCycleSave(account.session),
    stage: (attempt: ManualCycleSaveAttempt, current: () => boolean) =>
      account.store.stageManualCycleSave(account.session, attempt, current),
    clear: (attempt: ManualCycleSaveAttempt) =>
      account.store.clearManualCycleSave(account.session, attempt),
    read: (attempt: ManualCycleSaveAttempt) => checked(client.recoverManualCycle(attempt.command)),
    send: (attempt: ManualCycleSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelManualCycleSave(attempt.command))
        : checked(client.saveManualCycle(attempt.command)).pipe(
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
export type ManualCycleSaveOperations = ReturnType<typeof manualCycleSaveOperations>;
