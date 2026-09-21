import type { RecurringInput } from "@nest/contracts/recurring";
import { recurringEntryContext } from "./recurring-entry-context.ts";
import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringDecision } from "./recurring-approval-client.ts";
import type { RecurringApprovalAttempt } from "./recurring-approval-attempt.ts";
export function recurringApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) => account.store.readRecurringApproval(account.session, approvalId),
    stage: (attempt: RecurringApprovalAttempt, current: () => boolean) =>
      account.store.stageRecurringApproval(account.session, attempt, current),
    clear: (attempt: RecurringApprovalAttempt) =>
      account.store.clearRecurringApproval(account.session, attempt),
    context: (rule: RecurringInput) =>
      recurringEntryContext(account, client, {
        ruleId: rule.ruleId,
        editing: rule.expectedRevision !== null,
      }),
    read: (approvalId: string) => checked(client.recurringApproval(approvalId)),
    decide: (input: RecurringDecision) => checked(client.decideRecurring(input)),
  };
}
export type RecurringApprovalOperations = ReturnType<typeof recurringApprovalOperations>;
