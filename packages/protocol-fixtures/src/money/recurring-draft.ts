import * as Schema from "effect/Schema";
import { RecurringInput, RecurringSchedule } from "@nest/contracts/recurring";
import { RecurringRule } from "@nest/contracts/recurring-read";
import { CalendarDate } from "@nest/contracts/chores";
import { firstUncoveredRecurringCycle, formatChfField } from "@nest/domain/money";
import { initialExpenseDraft, parseExpenseDraft, type ExpenseDraft } from "./expense-draft.ts";
export interface RecurringDraft extends ExpenseDraft {
  mode: "fixed" | "variable";
  cadence: "weekly" | "monthly";
  day: string;
}
export interface RecurringDraftContext {
  today: string;
  ruleId: string;
  current: RecurringRule | null;
  members: readonly [string, string];
}
export type RecurringDraftResult =
  | { ok: true; rule: RecurringInput }
  | { ok: false; message: string };
const invalid = (message: string): RecurringDraftResult => ({ ok: false, message });
export function initialRecurringDraft(actor: string, today: string): RecurringDraft {
  return { ...initialExpenseDraft(actor, today), mode: "variable", cadence: "monthly", day: "1" };
}
export function editRecurringDraft(context: RecurringDraftContext): RecurringDraft {
  const rule = context.current;
  if (!rule) throw new Error("Editing requires a current recurring rule");
  const config = rule.configuration;
  return {
    ...initialRecurringDraft(
      config.payerId,
      config.startDate < context.today ? context.today : config.startDate,
    ),
    mode: config.mode,
    description: config.description,
    note: config.note ?? "",
    categoryId: config.categoryId,
    amount: config.amountCentimes === null ? "" : formatChfField(Number(config.amountCentimes)),
    split: "exact",
    firstExact: shareField(rule, context.members[0]),
    secondExact: shareField(rule, context.members[1]),
    cadence: config.schedule.kind,
    day: String(
      config.schedule.kind === "weekly" ? config.schedule.weekday : config.schedule.dayOfMonth,
    ),
  };
}
function shareField(rule: RecurringRule, actor: string) {
  const share = rule.configuration.allocations?.find((value) => value.memberId === actor);
  return share ? formatChfField(Number(share.centimes)) : "";
}
function contextFailure(context: RecurringDraftContext) {
  if (
    !Schema.is(CalendarDate)(context.today) ||
    !Schema.is(RecurringInput.fields.ruleId)(context.ruleId)
  )
    return "Load the current recurring setup before reviewing.";
  const current = context.current;
  if (!current) return null;
  if (!Schema.is(RecurringRule)(current) || current.ruleId !== context.ruleId)
    return "Reload this recurring expense before editing.";
  if (current.status === "cancelled") return "Cancelled recurring expenses cannot be edited.";
  if (
    current.status === "active" &&
    current.nextDueOn !== null &&
    current.nextDueOn < context.today
  )
    return "Resolve overdue cycles before changing this recurring expense.";
  return null;
}
export function parseRecurringDraft(
  draft: RecurringDraft,
  context: RecurringDraftContext,
): RecurringDraftResult {
  const failed = contextFailure(context);
  if (failed) return invalid(failed);
  const invalidDraft = draftFailure(draft, context.today);
  if (invalidDraft) return invalid(invalidDraft);
  const schedule =
    draft.cadence === "weekly"
      ? { kind: "weekly" as const, weekday: Number(draft.day) }
      : { kind: draft.cadence, dayOfMonth: Number(draft.day) };
  if (!Schema.is(RecurringSchedule)(schedule))
    return invalid("Choose a valid weekly or monthly schedule.");
  const expense = parseExpenseDraft(
    draft.mode === "variable" ? { ...draft, amount: "0", split: "equal" } : draft,
    context.members,
  );
  if (!expense.ok) return expense;
  const { description, payerId, categoryId, note, amountCentimes, allocations } = expense.expense;
  const common = { description, payerId, categoryId, note, startDate: draft.date, schedule };
  const configuration =
    draft.mode === "variable"
      ? { ...common, mode: "variable" as const, amountCentimes: null, allocations: null }
      : { ...common, mode: draft.mode, amountCentimes, allocations };
  return plannedRule(configuration, context);
}
function plannedRule(
  configuration: RecurringInput["configuration"],
  context: RecurringDraftContext,
): RecurringDraftResult {
  const cycle = firstUncoveredRecurringCycle(configuration.schedule, {
    from: configuration.startDate,
    coveredThrough: context.current?.coveredThrough ?? null,
  });
  if (!cycle) return invalid("No eligible cycle remains in the supported date range.");
  const rule = {
    ruleId: context.ruleId,
    expectedRevision: context.current?.revision ?? null,
    configuration,
    firstDueOn: cycle.dueOn,
  };
  return Schema.is(RecurringInput)(rule)
    ? { ok: true, rule }
    : invalid("Check this recurring configuration.");
}

function draftFailure(draft: RecurringDraft, today: string) {
  if (!Schema.is(CalendarDate)(draft.date) || draft.date < today)
    return "Choose a prospective start date, today or later. Earlier cycles are not backfilled.";
  if (draft.receiptPath != null || draft.receiptPending || draft.receiptTotal !== null)
    return "Recurring setup cannot attach a receipt or grocery receipt total.";
  if (!/^(?:[1-9]|[12]\d|3[01])$/.test(draft.day)) return "Choose a valid recurring day.";
  return null;
}
