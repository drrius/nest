import type { RecurringConfiguration } from "@nest/contracts/recurring";
import type { MoneyDetail } from "@nest/contracts/money-detail";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import type { MoneyReadView } from "./read-runtime.ts";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { ManualCycleSaveView } from "./recurring-manual-save-runtime.ts";
import { manualSaveAttempt } from "./recurring-manual-save-attempt.ts";
import { formatChf } from "./format.ts";
export function dueManualCycle(rule: RecurringRule, today: string) {
  if (rule.status !== "active" || !rule.nextDueOn) return null;
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
export function manualRequestEnabled(view: ManualCycleSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function manualContext(
  source: MoneyReadView,
  rule: RecurringReadView,
  save: ManualCycleSaveView,
) {
  if (!manualRequestEnabled(save) || save.attempt || save.result) return null;
  const detail = currentSource(source),
    target = currentRule(rule);
  if (!detail || !target) return null;
  const cycle = dueManualCycle(target.rule, target.today);
  if (!cycle || detail.householdId !== target.householdId) return null;
  if (!eligibleSource(detail, cycle)) return null;
  return { detail, target, cycle };
}
function eligibleSource(
  detail: typeof MoneyDetail.Type,
  cycle: { startsOn: string; through: string },
) {
  return (
    detail.reversedById === null &&
    ["expense", "replacement"].includes(detail.event.kind) &&
    detail.event.occurredOn >= cycle.startsOn &&
    detail.event.occurredOn <= cycle.through
  );
}
function currentSource(source: MoneyReadView) {
  return source.active &&
    !source.busy &&
    source.access === "ready" &&
    source.source === "online" &&
    source.entry?.kind === "detail"
    ? source.entry.value
    : null;
}
function currentRule(rule: RecurringReadView) {
  return rule.active && rule.online && !rule.busy && !rule.verify && rule.entry?.kind === "detail"
    ? rule.entry.value
    : null;
}
export function prepareManualConfirmation(
  context: NonNullable<ReturnType<typeof manualContext>>,
  operationId: string,
) {
  return {
    ...context,
    command: manualSaveAttempt({
      operationId,
      input: {
        ruleId: context.target.rule.ruleId,
        expectedRevision: context.target.rule.revision,
        dueOn: context.cycle.dueOn,
        sourceEventId: context.detail.event.eventId,
      },
    }).command,
  };
}
export type ManualConfirmation = ReturnType<typeof prepareManualConfirmation>;
export function manualConfirmationCurrent(
  expected: ManualConfirmation,
  current: ReturnType<typeof manualContext>,
) {
  return (
    current !== null && current.detail === expected.detail && current.target === expected.target
  );
}
export function manualConfirmationText(
  value: {
    detail: typeof MoneyDetail.Type;
    target: { rule: { ruleId: string; configuration: RecurringConfiguration } };
    cycle: { dueOn: string; startsOn: string; through: string };
  },
  actor: string,
) {
  const { detail, target, cycle } = value,
    config = target.rule.configuration;
  const name = (id: string) => (id === actor ? "You" : "Other household member");
  return [
    `Existing expense: ${detail.event.description}\n${formatChf(detail.event.amountCentimes)} · ${detail.event.occurredOn}\nPayer: ${name(detail.event.payerId!)}\n${detail.shares.map((s) => `${name(s.memberId)}: ${formatChf(s.allocatedCentimes!)}`).join("\n")}`,
    `Expense category: ${detail.category?.name ?? "None"}\nExpense note: ${detail.note ?? "None"}\nExpense reference: ${detail.event.eventId}`,
    `Recurring rule: ${config.description}\n${config.mode === "fixed" ? `Configured amount: ${formatChf(config.amountCentimes)}\n${config.allocations.map((s) => `${name(s.memberId)}: ${formatChf(s.centimes)}`).join("\n")}` : "Variable amount and split"}\nConfigured payer: ${name(config.payerId)}\nCategory: ${config.categoryId ?? "None"}\nNote: ${config.note ?? "None"}`,
    `Rule reference: ${target.rule.ruleId}\nDue: ${cycle.dueOn}\nPeriod: ${cycle.startsOn} through ${cycle.through}`,
    "Use this existing expense for this period, even if its amount, payer or split differs from the rule. This consumes the cycle and prevents another recurring posting for it. No expense, payment or balance change is created. The existing expense and future rule remain unchanged.",
  ].join("\n\n");
}
