import { LegacyAdoptionContext } from "./legacy-adoption.ts";
import * as Schema from "effect/Schema";
import {
  ExecuteLegacyAdoption,
  LegacyAdoptionInput,
  LegacyAdoptionReceipt,
} from "./legacy-adoption-command.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(LegacyAdoptionInput);
export const LegacyAdoptionApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideLegacyAdoption = Schema.Struct({
  ...ExecuteLegacyAdoption.fields,
  approved: Schema.Boolean,
});
export const LegacyAdoptionApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  input: LegacyAdoptionInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(LegacyAdoptionReceipt),
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
export const LegacyAdoptionApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: LegacyAdoptionApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type LegacyAdoptionApprovalEnvelope = typeof LegacyAdoptionApprovalEnvelope.Type;

export const LegacyAdoptionApprovalContext = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approvalId: Uuid,
  input: LegacyAdoptionInput,
  review: LegacyAdoptionContext,
}).check(
  Schema.makeFilter(
    (value) =>
      value.review.householdId === value.householdId &&
      value.review.rule.ruleId === value.input.ruleId,
  ),
);
export type LegacyAdoptionApprovalContext = typeof LegacyAdoptionApprovalContext.Type;
