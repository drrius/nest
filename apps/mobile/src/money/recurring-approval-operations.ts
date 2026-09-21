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
      rule.expectedRevision === null
        ? checked(creationContext(client, rule.ruleId))
        : recurringEntryContext(account, client, { ruleId: rule.ruleId, editing: true }),
    read: (approvalId: string) => checked(client.recurringApproval(approvalId)),
    decide: (input: RecurringDecision) => checked(client.decideRecurring(input)),
  };
}
function creationContext(client: MoneyClient, ruleId: string) {
  return Effect.gen(function* () {
    // A proposed create can collide with an existing rule. Search ordered pages
    // rather than interpreting a failed detail request as proof of absence.
    let snapshot = yield* client.recurringRules(null);
    let current = snapshot.rules.find((rule) => rule.ruleId === ruleId) ?? null;
    while (!current && snapshot.next !== null && snapshot.next < ruleId) {
      snapshot = yield* client.recurringRules(snapshot.next);
      current = snapshot.rules.find((rule) => rule.ruleId === ruleId) ?? null;
    }
    const balance = yield* client.balance();
    const context = {
      ruleId,
      today: snapshot.today,
      current,
      members: [balance.members[0].actorId, balance.members[1].actorId] as const,
    };
    return { context, members: balance.members };
  });
}
export type RecurringApprovalOperations = ReturnType<typeof recurringApprovalOperations>;
