import type { RecurringStateInput } from "@nest/contracts/recurring-state";
import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateDecision } from "./recurring-state-approval-client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
export function recurringStateApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) =>
      account.store.readRecurringStateApproval(account.session, approvalId),
    stage: (attempt: RecurringStateApprovalAttempt, current: () => boolean) =>
      account.store.stageRecurringStateApproval(account.session, attempt, current),
    clear: (attempt: RecurringStateApprovalAttempt) =>
      account.store.clearRecurringStateApproval(account.session, attempt),
    context: (change: RecurringStateInput) =>
      checked(client.recurringRule(change.ruleId)).pipe(Effect.map((value) => value.rule)),
    read: (approvalId: string) => checked(client.recurringStateApproval(approvalId)),
    decide: (input: RecurringStateDecision) => checked(client.decideRecurringState(input)),
  };
}
export type RecurringStateApprovalOperations = ReturnType<typeof recurringStateApprovalOperations>;
export type RecurringStateApprovalContext = Effect.Success<
  ReturnType<RecurringStateApprovalOperations["context"]>
>;
