import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { VariableCycleSaveView } from "./recurring-variable-save-runtime.ts";
import { variableSaveAttempt } from "./recurring-variable-save-attempt.ts";
import {
  dueVariableCycle,
  parseVariableAmount,
  type VariableAmountDraft,
} from "./recurring-variable-draft.ts";
import type { ExpenseEntryOptions } from "./entry-options.ts";
import { expenseReview } from "./expense-review.ts";
export function variableRequestEnabled(view: VariableCycleSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function currentVariableDetail(read: RecurringReadView, save: VariableCycleSaveView) {
  if (!variableRequestEnabled(save) || save.attempt || save.result) return null;
  if (!readReady(read) || read.entry?.kind !== "detail") return null;
  const detail = read.entry.value;
  return dueVariableCycle(detail.rule, detail.today) ? detail : null;
}
export function prepareVariableConfirmation(
  context: { read: RecurringReadView; save: VariableCycleSaveView },
  draft: VariableAmountDraft,
  members: ExpenseEntryOptions["members"],
  operationId: string,
) {
  const detail = currentVariableDetail(context.read, context.save);
  if (!detail) return { ok: false as const, message: "Load a current, due variable bill online." };
  const parsed = parseVariableAmount(draft, detail.rule, [members[0].actorId, members[1].actorId]);
  if (!parsed.ok) return parsed;
  const expense = parsed.expense;
  const command = variableSaveAttempt({
    operationId,
    input: {
      ruleId: detail.rule.ruleId,
      expectedRevision: detail.rule.revision,
      dueOn: expense.date,
      amountCentimes: expense.amountCentimes,
      allocations: expense.allocations,
    },
  }).command;
  return { ok: true as const, detail, command, expense };
}
export type VariableConfirmation = Extract<
  ReturnType<typeof prepareVariableConfirmation>,
  { ok: true }
>;
export function variableConfirmationCurrent(
  expected: VariableConfirmation,
  read: RecurringReadView,
  save: VariableCycleSaveView,
) {
  return currentVariableDetail(read, save) === expected.detail;
}
export function variableConfirmationText(
  expected: VariableConfirmation,
  options: ExpenseEntryOptions,
) {
  const category = options.categories.categories.find(
    (row) => row.categoryId === expected.expense.categoryId,
  );
  return [
    expenseReview(expected.expense, options.members),
    `Rule reference: ${expected.detail.rule.ruleId}`,
    `Category: ${category?.name ?? expected.expense.categoryId ?? "None"}`,
    `Note: ${expected.expense.note ?? "None"}`,
    "Record this amount and split for this cycle only. This consumes the cycle; it does not change the recurring rule or authorize future variable amounts.",
  ].join("\n\n");
}

function readReady(read: RecurringReadView) {
  return read.active && read.online && !read.busy && !read.verify;
}
