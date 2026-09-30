import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { VariableCycleSaveAttempt } from "./recurring-variable-save-attempt.ts";
export function variableCycleSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readVariableCycleSave(account.session),
    stage: (attempt: VariableCycleSaveAttempt, current: () => boolean) =>
      account.store.stageVariableCycleSave(account.session, attempt, current),
    clear: (attempt: VariableCycleSaveAttempt) =>
      account.store.clearVariableCycleSave(account.session, attempt),
    read: (attempt: VariableCycleSaveAttempt) =>
      checked(client.recoverVariableCycle(attempt.command)),
    send: (attempt: VariableCycleSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelVariableCycleSave(attempt.command))
        : checked(client.saveVariableCycle(attempt.command)).pipe(
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
export type VariableCycleSaveOperations = ReturnType<typeof variableCycleSaveOperations>;
