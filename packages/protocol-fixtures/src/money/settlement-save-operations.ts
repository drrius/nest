import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { SettlementSaveAttempt } from "./settlement-save-attempt.ts";
export function settlementSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readSettlementSave(account.session),
    stage: (attempt: SettlementSaveAttempt, current: () => boolean) =>
      account.store.stageSettlementSave(account.session, attempt, current),
    clear: (attempt: SettlementSaveAttempt) =>
      account.store.clearSettlementSave(account.session, attempt),
    read: (attempt: SettlementSaveAttempt) => checked(client.recoverSettlement(attempt.command)),
    send: (attempt: SettlementSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelSettlement(attempt.command))
        : checked(client.saveSettlement(attempt.command)).pipe(
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
export type SettlementSaveOperations = ReturnType<typeof settlementSaveOperations>;
