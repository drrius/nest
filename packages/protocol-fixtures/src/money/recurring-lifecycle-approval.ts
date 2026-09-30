import type {
  RecurringStateApproval,
  RecurringStateDecision,
} from "./recurring-state-approval-client.ts";
import type {
  RecurringResumeApproval,
  RecurringResumeDecision,
} from "./recurring-resume-approval-client.ts";
import { resumeDatePassed } from "./recurring-resume-review.ts";
export type RecurringApprovalKind = "state" | "resume";
export type RecurringLifecycleApproval = RecurringStateApproval | RecurringResumeApproval;
export type RecurringLifecycleDecision = RecurringStateDecision | RecurringResumeDecision;
export function lifecycleDatePassed(approval: RecurringLifecycleApproval) {
  return "reviewedOn" in approval && resumeDatePassed(approval);
}
export function lifecycleDecision(
  approval: RecurringLifecycleApproval,
  decision: { approvalId: string; operationId: string; approved: boolean },
): RecurringLifecycleDecision {
  return "reviewedOn" in approval
    ? { ...decision, change: approval.change }
    : { ...decision, change: approval.change };
}
