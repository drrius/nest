import * as Schema from "effect/Schema";
import { ExecuteManualCycle, ManualCycleInput, ManualCycleReceipt } from "./recurring-manual.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(ManualCycleInput);
export const ManualCycleApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideManualCycle = Schema.Struct({
  ...ExecuteManualCycle.fields,
  approved: Schema.Boolean,
});
export const ManualCycleApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  input: ManualCycleInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(ManualCycleReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.input, value.input)
    );
  }),
);
export const ManualCycleApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: ManualCycleApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type ManualCycleApprovalEnvelope = typeof ManualCycleApprovalEnvelope.Type;
