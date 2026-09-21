import * as Schema from "effect/Schema";
import { ExecuteCorrection, CorrectionInput, CorrectionReceipt } from "./correction.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(CorrectionInput);
export const CorrectionApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideCorrection = Schema.Struct({
  ...ExecuteCorrection.fields,
  approved: Schema.Boolean,
});
export const CorrectionApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  correction: CorrectionInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(CorrectionReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.correction, value.correction)
    );
  }),
);
export const CorrectionApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: CorrectionApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type CorrectionApprovalEnvelope = typeof CorrectionApprovalEnvelope.Type;
