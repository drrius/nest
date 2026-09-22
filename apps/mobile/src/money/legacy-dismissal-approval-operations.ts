import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  LegacyDismissalApproval,
  LegacyDismissalDecision,
} from "./legacy-dismissal-approval-client.ts";
export function legacyDismissalApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  // Approval IDs are globally unique. Reuse the strict owner-scoped decision metadata store.
  return {
    saved: (approvalId: string) =>
      account.store.readRecurringStateApproval(account.session, approvalId),
    stage: (attempt: RecurringStateApprovalAttempt, current: () => boolean) =>
      account.store.stageRecurringStateApproval(account.session, attempt, current),
    withdraw: (attempt: RecurringStateApprovalAttempt, current: () => boolean) =>
      account.store.withdrawRecurringStateApproval(account.session, attempt, current),
    clear: (attempt: RecurringStateApprovalAttempt) =>
      account.store.clearRecurringStateApproval(account.session, attempt),
    context: (approval: LegacyDismissalApproval) =>
      checked(client.legacyDismissalContext(approval)),
    read: (approvalId: string) => checked(client.legacyDismissalApproval(approvalId)),
    decide: (input: LegacyDismissalDecision) => checked(client.decideLegacyDismissal(input)),
  };
}
export type LegacyDismissalApprovalOperations = ReturnType<
  typeof legacyDismissalApprovalOperations
>;
export type LegacyDismissalApprovalContext = Effect.Success<
  ReturnType<LegacyDismissalApprovalOperations["context"]>
>;
