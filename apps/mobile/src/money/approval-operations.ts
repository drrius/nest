import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { ExpenseDecision } from "./approval-client.ts";
import type { ExpenseApprovalAttempt } from "./approval-attempt.ts";
export function expenseApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) => account.store.readExpenseApproval(account.session, approvalId),
    stage: (attempt: ExpenseApprovalAttempt, current: () => boolean) =>
      account.store.stageExpenseApproval(account.session, attempt, current),
    clear: (attempt: ExpenseApprovalAttempt) =>
      account.store.clearExpenseApproval(account.session, attempt),
    read: (approvalId: string) => checked(client.approval(approvalId)),
    decide: (input: ExpenseDecision) => checked(client.decideExpense(input)),
  };
}
export type ExpenseApprovalOperations = ReturnType<typeof expenseApprovalOperations>;
