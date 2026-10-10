import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RefundDecision } from "./refund-approval-client.ts";
import type { RefundApprovalAttempt } from "./refund-approval-attempt.ts";
export function refundApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) => account.store.readRefundApproval(account.session, approvalId),
    stage: (attempt: RefundApprovalAttempt, current: () => boolean) =>
      account.store.stageRefundApproval(account.session, attempt, current),
    clear: (attempt: RefundApprovalAttempt) =>
      account.store.clearRefundApproval(account.session, attempt),
    read: (approvalId: string) => checked(client.refundApproval(approvalId)),
    decide: (input: RefundDecision) => checked(client.decideRefund(input)),
  };
}
export type RefundApprovalOperations = ReturnType<typeof refundApprovalOperations>;
