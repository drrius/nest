import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { CorrectionDecision } from "./correction-approval-client.ts";
import type { CorrectionApprovalAttempt } from "./correction-approval-attempt.ts";
export function correctionApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) =>
      account.store.readCorrectionApproval(account.session, approvalId),
    stage: (attempt: CorrectionApprovalAttempt, current: () => boolean) =>
      account.store.stageCorrectionApproval(account.session, attempt, current),
    clear: (attempt: CorrectionApprovalAttempt) =>
      account.store.clearCorrectionApproval(account.session, attempt),
    context: (source: string) => checked(client.correctionContext(source)),
    read: (approvalId: string) => checked(client.correctionApproval(approvalId)),
    decide: (input: CorrectionDecision) => checked(client.decideCorrection(input)),
  };
}
export type CorrectionApprovalOperations = ReturnType<typeof correctionApprovalOperations>;
