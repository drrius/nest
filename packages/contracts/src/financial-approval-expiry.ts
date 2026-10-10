import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const FinancialApprovalExpiryQuery = Schema.Struct({
  approvalId: Uuid,
  operationId: Uuid,
  command: Schema.Literals([
    "expenses.record",
    "expenses.refund",
    "expenses.correct",
    "settlements.record",
    "recurring.create",
    "recurring.update",
    "recurring.pause",
    "recurring.cancel",
    "recurring.resume",
    "recurring.record-cycle",
    "recurring.link-cycle",
  ]),
});
export const FinancialApprovalExpiry = Schema.Struct({
  ...FinancialApprovalExpiryQuery.fields,
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  expiredUnused: Schema.Boolean,
  checkedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
    Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
  ),
});
