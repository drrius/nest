import * as Schema from "effect/Schema";
import {
  ExecuteVariableCycle,
  VariableCycleInput,
  VariableCycleReceipt,
} from "./recurring-variable.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(VariableCycleInput);
export const VariableCycleApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideVariableCycle = Schema.Struct({
  ...ExecuteVariableCycle.fields,
  approved: Schema.Boolean,
});
export const VariableCycleApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  input: VariableCycleInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(VariableCycleReceipt),
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
export const VariableCycleApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: VariableCycleApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type VariableCycleApprovalEnvelope = typeof VariableCycleApprovalEnvelope.Type;
