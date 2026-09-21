import type { RecurringRule } from "@nest/contracts/recurring-read";
import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import { initialExpenseDraft, parseExpenseDraft, type ExpenseDraft } from "./expense-draft.ts";
export type VariableAmountDraft = Pick<
  ExpenseDraft,
  "amount" | "split" | "firstExact" | "secondExact" | "firstPercent"
>;
export function dueVariableCycle(rule: RecurringRule, today: string) {
  if (rule.status !== "active" || rule.configuration.mode !== "variable" || !rule.nextDueOn)
    return null;
  const cycle = firstUncoveredRecurringCycle(rule.configuration.schedule, {
    from: rule.nextDueOn,
    coveredThrough: rule.coveredThrough,
  });
  return cycle &&
    cycle.dueOn === rule.nextDueOn &&
    cycle.dueOn >= rule.configuration.startDate &&
    cycle.dueOn <= today
    ? cycle
    : null;
}
export function parseVariableAmount(
  draft: VariableAmountDraft,
  rule: RecurringRule,
  members: readonly [string, string],
) {
  const config = rule.configuration;
  const parsed = parseExpenseDraft(
    {
      ...initialExpenseDraft(config.payerId, rule.nextDueOn ?? ""),
      amount: draft.amount,
      split: draft.split,
      firstExact: draft.firstExact,
      secondExact: draft.secondExact,
      firstPercent: draft.firstPercent,
      description: config.description,
      note: config.note ?? "",
      categoryId: config.categoryId,
    },
    members,
  );
  return parsed.ok
    ? {
        ...parsed,
        expense: { ...parsed.expense, description: config.description, note: config.note },
      }
    : parsed;
}
