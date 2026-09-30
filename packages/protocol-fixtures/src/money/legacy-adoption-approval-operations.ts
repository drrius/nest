import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  LegacyAdoptionApproval,
  LegacyAdoptionDecision,
} from "./legacy-adoption-approval-client.ts";
export function legacyAdoptionApprovalOperations(account: OfflineAccount, client: MoneyClient) {
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
    context: (approval: LegacyAdoptionApproval) =>
      checked(
        Effect.gen(function* () {
          const loaded = yield* client.legacyAdoptionApprovalContext(approval);
          const category =
            approval.input.configuration.categoryId === null
              ? null
              : yield* client.category(approval.input.configuration.categoryId);
          const originalCategory =
            loaded.review.rule.categoryId === null
              ? null
              : yield* client.category(loaded.review.rule.categoryId);
          const members = (yield* client.balance()).members;
          return { ...loaded, category, originalCategory, members };
        }),
      ),
    read: (approvalId: string) => checked(client.legacyAdoptionApproval(approvalId)),
    decide: (input: LegacyAdoptionDecision) => checked(client.decideLegacyAdoption(input)),
  };
}
export type LegacyAdoptionApprovalOperations = ReturnType<typeof legacyAdoptionApprovalOperations>;
export type LegacyAdoptionApprovalContext = Effect.Success<
  ReturnType<LegacyAdoptionApprovalOperations["context"]>
>;
