import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { SettlementDecision } from "./settlement-approval-client.ts";
import type { SettlementApprovalAttempt } from "./settlement-approval-attempt.ts";
export function settlementApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) =>
      account.store.readSettlementApproval(account.session, approvalId),
    stage: (attempt: SettlementApprovalAttempt, current: () => boolean) =>
      account.store.stageSettlementApproval(account.session, attempt, current),
    clear: (attempt: SettlementApprovalAttempt) =>
      account.store.clearSettlementApproval(account.session, attempt),
    read: (approvalId: string) => checked(client.settlementApproval(approvalId)),
    decide: (input: SettlementDecision) => checked(client.decideSettlement(input)),
  };
}
export type SettlementApprovalOperations = ReturnType<typeof settlementApprovalOperations>;
