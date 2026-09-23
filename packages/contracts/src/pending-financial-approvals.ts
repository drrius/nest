import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(
  Schema.isUUID(),
  Schema.makeFilter((value) => value === value.toLowerCase()),
);
export const PendingFinancialApprovalQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const PendingFinancialCommand = Schema.Literals([
  "expenses.record",
  "expenses.correct",
  "expenses.refund",
  "settlements.record",
  "groceryExpenses.record",
  "recurring.create",
  "recurring.update",
  "recurring.pause",
  "recurring.cancel",
  "recurring.resume",
  "recurring.record-cycle",
  "recurring.link-cycle",
  "recurring.dismiss-legacy-draft",
  "recurring.confirm-legacy-draft",
  "recurring.adopt-legacy",
]);
export const PendingFinancialApproval = Schema.Struct({
  approvalId: Uuid,
  command: PendingFinancialCommand,
  expiresAt: Schema.String.check(
    Schema.makeFilter(
      (value) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 19) === value.slice(0, 19),
    ),
  ),
});
export const PendingFinancialApprovals = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  actorId: Uuid,
  approvals: Schema.Array(PendingFinancialApproval).check(Schema.isMaxLength(20)),
  next: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter((page) => {
    let previous = "";
    for (const row of page.approvals) {
      if (row.approvalId <= previous) return false;
      previous = row.approvalId;
    }
    return page.next === null || (page.approvals.length === 20 && page.next === previous);
  }),
);
