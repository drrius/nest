import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  ManualCycleApproval,
  ManualCycleDecision,
} from "./recurring-manual-approval-client.ts";
export function manualCycleApprovalOperations(account: OfflineAccount, client: MoneyClient) {
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
    clear: (attempt: RecurringStateApprovalAttempt) =>
      account.store.clearRecurringStateApproval(account.session, attempt),
    context: (approval: ManualCycleApproval) => checked(client.manualCycleContext(approval)),
    read: (approvalId: string) => checked(client.manualCycleApproval(approvalId)),
    decide: (input: ManualCycleDecision) => checked(client.decideManualCycle(input)),
  };
}
export type ManualCycleApprovalOperations = ReturnType<typeof manualCycleApprovalOperations>;
export type ManualCycleApprovalContext = Effect.Success<
  ReturnType<ManualCycleApprovalOperations["context"]>
>;
