import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  LegacyConfirmationApproval,
  LegacyConfirmationDecision,
} from "./legacy-confirmation-approval-client.ts";
export function legacyConfirmationApprovalOperations(account: OfflineAccount, client: MoneyClient) {
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
    context: (approval: LegacyConfirmationApproval) =>
      checked(
        Effect.gen(function* () {
          const loaded = yield* client.legacyConfirmationContext(approval);
          const category =
            approval.input.expense.categoryId === null
              ? null
              : yield* client.category(approval.input.expense.categoryId);
          return { ...loaded, category };
        }),
      ),
    read: (approvalId: string) => checked(client.legacyConfirmationApproval(approvalId)),
    decide: (input: LegacyConfirmationDecision) => checked(client.decideLegacyConfirmation(input)),
  };
}
export type LegacyConfirmationApprovalOperations = ReturnType<
  typeof legacyConfirmationApprovalOperations
>;
export type LegacyConfirmationApprovalContext = Effect.Success<
  ReturnType<LegacyConfirmationApprovalOperations["context"]>
>;
