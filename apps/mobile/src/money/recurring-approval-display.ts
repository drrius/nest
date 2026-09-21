import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import type { RecurringEntryContext } from "./recurring-entry-context.ts";
import type { RecurringApproval } from "./recurring-approval-client.ts";
import type { MoneyCategory } from "@nest/contracts/money-category";
import type { RecurringApprovalView } from "./recurring-approval-runtime.ts";
import { recurringConfirmationText } from "./recurring-confirmation.ts";
type ReviewContext = RecurringEntryContext & { category?: MoneyCategory | null };
export function recurringRevisionSuperseded(
  approval: RecurringApproval,
  loaded: RecurringEntryContext | null,
) {
  const { rule } = approval,
    current = loaded?.context.current;
  return (
    current !== null &&
    current !== undefined &&
    current.ruleId === rule.ruleId &&
    current.revision !== rule.expectedRevision
  );
}
export function matchesRecurringContext(approval: RecurringApproval, loaded: ReviewContext | null) {
  if (!loaded) return false;
  const { rule } = approval,
    { context } = loaded,
    current = context.current;
  if (rule.ruleId !== context.ruleId || rule.expectedRevision !== (current?.revision ?? null))
    return false;
  if (!eligible(approval, loaded)) return false;
  const cycle = firstUncoveredRecurringCycle(rule.configuration.schedule, {
    from: rule.configuration.startDate,
    coveredThrough: current?.coveredThrough ?? null,
  });
  return cycle?.dueOn === rule.firstDueOn;
}
function validCategory(approval: RecurringApproval, loaded: ReviewContext) {
  const categoryId = approval.rule.configuration.categoryId;
  return (
    categoryId === null || (loaded.category?.categoryId === categoryId && !loaded.category.archived)
  );
}

export function recurringApprovalText(
  approval: RecurringApproval,
  context: ReviewContext | null,
  actor: string,
) {
  const { categoryId, note } = approval.rule.configuration;
  const category =
    categoryId === null
      ? "None"
      : (context?.category?.name ?? "Unavailable; reload before confirming");
  return [
    recurringConfirmationText({ operationId: approval.operationId, rule: approval.rule }, actor),
    `Category: ${category}${context?.category?.archived ? " (archived)" : ""}.`,
    `Note: ${note ?? "None"}`,
  ].join("\n\n");
}
export function recurringApprovalActions(view: RecurringApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const loaded = ready(view);
  const decision = loaded && pending && !view.attempt && valid;
  return {
    confirm:
      decision && view.approval !== null && matchesRecurringContext(view.approval, view.context),
    deny: decision,
    retry: loaded && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}

function eligible(approval: RecurringApproval, loaded: ReviewContext) {
  const config = approval.rule.configuration,
    { context } = loaded;
  return (
    validTiming(config.startDate, context) &&
    validMembers(config, context.members) &&
    validCategory(approval, loaded)
  );
}
function validTiming(start: string, context: RecurringEntryContext["context"]) {
  const current = context.current;
  if (start < context.today || current?.status === "cancelled") return false;
  return !(
    current?.status === "active" &&
    current.nextDueOn !== null &&
    current.nextDueOn < context.today
  );
}
function validMembers(
  config: RecurringApproval["rule"]["configuration"],
  members: readonly string[],
) {
  return (
    members.includes(config.payerId) &&
    (config.allocations === null ||
      config.allocations.every((share) => members.includes(share.memberId)))
  );
}

const isPending = (approval: RecurringApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: RecurringApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
const ready = (view: RecurringApprovalView) =>
  view.active && view.online && view.fresh && !view.busy && !view.verify;
