import * as Schema from "effect/Schema";
import { ExecuteRecurring, RecurringInput, RecurringReceipt } from "./recurring.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(RecurringInput);
export const RecurringApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideRecurring = Schema.Struct({
  ...ExecuteRecurring.fields,
  approved: Schema.Boolean,
});
export const RecurringApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  rule: RecurringInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(RecurringReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.rule, value.rule)
    );
  }),
);
export const RecurringApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: RecurringApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type RecurringApprovalEnvelope = typeof RecurringApprovalEnvelope.Type;
