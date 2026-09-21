import * as Schema from "effect/Schema";
import { ExecuteSettlement, SettlementInput, SettlementReceipt } from "./settlement.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(SettlementInput);
export const SettlementApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideSettlement = Schema.Struct({
  ...ExecuteSettlement.fields,
  approved: Schema.Boolean,
});
export const SettlementApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  settlement: SettlementInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(SettlementReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.settlement, value.settlement)
    );
  }),
);
export const SettlementApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: SettlementApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      [value.approval.settlement.payerId, value.approval.settlement.recipientId].includes(
        value.actorId,
      ) &&
      (value.approval.receipt === null ||
        (value.approval.receipt.actorId === value.actorId &&
          value.approval.receipt.householdId === value.householdId)),
  ),
);
export type SettlementApprovalEnvelope = typeof SettlementApprovalEnvelope.Type;
