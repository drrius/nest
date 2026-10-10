import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  VariableCycleApproval,
  VariableCycleDecision,
} from "./recurring-variable-approval-client.ts";
export function variableCycleApprovalOperations(account: OfflineAccount, client: MoneyClient) {
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
    context: (input: VariableCycleApproval["input"]) => checked(client.recurringRule(input.ruleId)),
    read: (approvalId: string) => checked(client.variableCycleApproval(approvalId)),
    decide: (input: VariableCycleDecision) => checked(client.decideVariableCycle(input)),
  };
}
export type VariableCycleApprovalOperations = ReturnType<typeof variableCycleApprovalOperations>;
export type VariableCycleApprovalContext = Effect.Success<
  ReturnType<VariableCycleApprovalOperations["context"]>
>;
