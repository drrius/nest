import type {
  PendingFinancialApproval,
  PendingFinancialCommand,
} from "@nest/contracts/pending-financial-approvals";
const destinations = {
  "expenses.record": ["/expense-approval", "Review expense"],
  "expenses.correct": ["/correction-approval", "Review correction"],
  "expenses.refund": ["/refund-approval", "Review refund"],
  "settlements.record": ["/settlement-approval", "Review settlement"],
  "recurring.create": ["/recurring-approval", "Review recurring expense"],
  "recurring.update": ["/recurring-approval", "Review recurring changes"],
  "recurring.pause": ["/recurring-state-approval", "Review pause"],
  "recurring.cancel": ["/recurring-state-approval", "Review cancellation"],
  "recurring.resume": ["/recurring-resume-approval", "Review resumption"],
  "recurring.record-cycle": ["/recurring-variable-approval", "Review variable bill"],
  "recurring.link-cycle": ["/recurring-manual-approval", "Review recorded bill link"],
  "recurring.dismiss-legacy-draft": ["/legacy-dismissal-approval", "Review legacy draft dismissal"],
  "recurring.confirm-legacy-draft": [
    "/legacy-confirmation-approval",
    "Review legacy draft confirmation",
  ],
  "recurring.adopt-legacy": ["/legacy-adoption-approval", "Review legacy rule adoption"],
} as const satisfies Record<typeof PendingFinancialCommand.Type, readonly [string, string]>;
export function pendingApprovalLink(row: typeof PendingFinancialApproval.Type) {
  const [pathname, label] = destinations[row.command];
  return { label, href: { pathname, params: { approvalId: row.approvalId } } };
}
