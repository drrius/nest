import type { RecurringConfiguration } from "@nest/contracts/recurring";
import type { RecurringDetail } from "@nest/contracts/recurring-read";
import type { VariableCycleApproval } from "./recurring-variable-approval-client.ts";
import type { VariableCycleApprovalView } from "./recurring-variable-approval-runtime.ts";
import { dueVariableCycle } from "./recurring-variable-draft.ts";
import { formatChf } from "./format.ts";
import { recurringStateSummary } from "./recurring-state-summary.ts";
export function variableCycleSuperseded(
  approval: VariableCycleApproval,
  current: RecurringDetail | null,
) {
  if (!current || current.rule.ruleId !== approval.input.ruleId) return false;
  const rule = current.rule;
  return (
    rule.revision !== approval.input.expectedRevision ||
    (rule.coveredThrough !== null && rule.coveredThrough >= approval.input.dueOn) ||
    (rule.nextDueOn !== null && rule.nextDueOn > approval.input.dueOn)
  );
}
export function matchesVariableCycleContext(
  approval: VariableCycleApproval,
  current: RecurringDetail | null,
) {
  if (!current || variableCycleSuperseded(approval, current)) return false;
  return (
    current.rule.ruleId === approval.input.ruleId &&
    current.rule.revision === approval.input.expectedRevision &&
    dueVariableCycle(current.rule, current.today)?.dueOn === approval.input.dueOn
  );
}
export function variableCycleApprovalText(
  approval: VariableCycleApproval,
  current: RecurringDetail | null,
  actor: string,
) {
  const input = approval.input;
  const rule = matchesVariableCycleContext(approval, current) ? current!.rule : null;
  const receipt = approval.receipt;
  const config = receipt?.configuration ?? rule?.configuration;
  return [
    config
      ? config.description
      : approval.status === "denied"
        ? "Declined variable bill proposal"
        : "The current rule no longer matches this proposal. Request a new review.",
    `Rule reference: ${input.ruleId}`,
    `Cycle due ${input.dueOn}: ${formatChf(input.amountCentimes)}`,
    ...input.allocations.map(
      (share) =>
        `${share.memberId === actor ? "Your share" : "Other member’s share"}: ${formatChf(share.centimes)}`,
    ),
    configurationText(config, actor),
    rule ? recurringStateSummary(rule, actor) : "",
    outcomeText(approval),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function variableCycleApprovalActions(view: VariableCycleApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const ready = approvalReady(view);
  const decision = ready && pending && valid && view.attempt === null;
  return {
    confirm:
      decision &&
      view.approval !== null &&
      matchesVariableCycleContext(view.approval, view.context),
    deny: decision,
    retry: ready && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}
function approvalReady(view: VariableCycleApprovalView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}

function configurationText(config: RecurringConfiguration | undefined, actor: string) {
  return config
    ? `Payer: ${config.payerId === actor ? "You" : "Other household member"}\nCategory: ${config.categoryId ?? "None"}\nNote: ${config.note ?? "None"}`
    : "";
}
function outcomeText(approval: VariableCycleApproval) {
  if (approval.status === "consumed")
    return "This expense is recorded and this cycle is consumed. No payment was made.";
  if (approval.status === "denied")
    return "This proposal was declined and did not record an expense.";
  return "Confirm only this cycle’s amount and split. This records a shared expense and consumes the cycle without changing the mandate or making a payment.";
}
const isPending = (approval: VariableCycleApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: VariableCycleApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
