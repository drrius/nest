import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringResumeApproval } from "./recurring-resume-approval-client.ts";
import type { RecurringLifecycleApproval } from "./recurring-lifecycle-approval.ts";
import { resumeConfirmationText } from "./recurring-resume-confirmation.ts";
export function resumeMatchesRule(approval: RecurringLifecycleApproval, rule: RecurringRule) {
  if (!("reviewedOn" in approval)) return true;
  const { change } = approval;
  if (change.resumeFrom < rule.configuration.startDate) return false;
  return (
    firstUncoveredRecurringCycle(rule.configuration.schedule, {
      from: change.resumeFrom,
      coveredThrough: rule.coveredThrough,
    })?.dueOn === change.firstDueOn
  );
}
export function recurringResumeApprovalText(
  approval: RecurringResumeApproval,
  rule: RecurringRule | null,
  actor: string,
) {
  const { change } = approval;
  if (approval.status === "consumed" || approval.status === "denied")
    return `${approval.status === "consumed" ? "Recorded" : "Declined"} resumption for rule ${change.ruleId}. Reviewed resume date: ${change.resumeFrom}. First eligible date: ${change.firstDueOn}. No paused backlog is backfilled.`;
  if (!rule || rule.revision !== change.expectedRevision)
    return `Resumption proposal for rule ${change.ruleId}. Resume from ${change.resumeFrom}; first eligible date ${change.firstDueOn}. Load a matching current rule before authorizing. No paused backlog will be backfilled.`;
  return resumeConfirmationText({ rule, change }, actor);
}
