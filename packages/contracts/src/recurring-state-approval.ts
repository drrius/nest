import * as Schema from "effect/Schema";
import {
  ExecuteRecurringState,
  RecurringStateInput,
  RecurringStateReceipt,
} from "./recurring-state.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(RecurringStateInput);
export const RecurringStateApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideRecurringState = Schema.Struct({
  ...ExecuteRecurringState.fields,
  approved: Schema.Boolean,
});
export const RecurringStateApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  change: RecurringStateInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(RecurringStateReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.change, value.change)
    );
  }),
);
export const RecurringStateApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: RecurringStateApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type RecurringStateApprovalEnvelope = typeof RecurringStateApprovalEnvelope.Type;
