import type { RecurringResumeApproval } from "./recurring-resume-approval-client.ts";
/** Only use a freshly fetched, operation-fenced server review to retire saved intent. */
export function resumeDatePassed(approval: RecurringResumeApproval) {
  return approval.change.resumeFrom < approval.reviewedOn;
}
