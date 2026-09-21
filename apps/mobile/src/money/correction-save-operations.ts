import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { CorrectionSaveAttempt } from "./correction-save-attempt.ts";
export function correctionSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readCorrectionSave(account.session),
    stage: (attempt: CorrectionSaveAttempt, current: () => boolean) =>
      account.store.stageCorrectionSave(account.session, attempt, current),
    clear: (attempt: CorrectionSaveAttempt) =>
      account.store.clearCorrectionSave(account.session, attempt),
    read: (attempt: CorrectionSaveAttempt) => checked(client.recoverCorrection(attempt.command)),
    send: (attempt: CorrectionSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelCorrection(attempt.command))
        : checked(client.saveCorrection(attempt.command)).pipe(
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
export type CorrectionSaveOperations = ReturnType<typeof correctionSaveOperations>;
