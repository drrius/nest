import * as Schema from "effect/Schema";
import { ExecuteRefund, RefundInput, RefundReceipt } from "./refund.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(RefundInput);
export const RefundApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideRefund = Schema.Struct({
  ...ExecuteRefund.fields,
  approved: Schema.Boolean,
});
export const RefundApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  refund: RefundInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(RefundReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.refund, value.refund)
    );
  }),
);
export const RefundApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: RefundApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.refund.allocations.some((share) => share.memberId === value.actorId) &&
      (value.approval.receipt === null ||
        (value.approval.receipt.actorId === value.actorId &&
          value.approval.receipt.householdId === value.householdId)),
  ),
);
export type RefundApprovalEnvelope = typeof RefundApprovalEnvelope.Type;
