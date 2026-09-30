import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RefundSaveAttempt } from "./refund-save-attempt.ts";
export function refundSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRefundSave(account.session),
    stage: (attempt: RefundSaveAttempt, current: () => boolean) =>
      account.store.stageRefundSave(account.session, attempt, current),
    clear: (attempt: RefundSaveAttempt) => account.store.clearRefundSave(account.session, attempt),
    read: (attempt: RefundSaveAttempt) => checked(client.recoverRefund(attempt.command)),
    send: (attempt: RefundSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelRefund(attempt.command))
        : checked(client.saveRefund(attempt.command)).pipe(
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
export type RefundSaveOperations = ReturnType<typeof refundSaveOperations>;
