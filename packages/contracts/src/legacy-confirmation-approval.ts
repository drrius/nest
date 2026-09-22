import { LegacyDraftContext } from "./legacy-draft-dismissal.ts";
import * as Schema from "effect/Schema";
import {
  ExecuteLegacyConfirmation,
  LegacyConfirmInput,
  LegacyConfirmationReceipt,
} from "./legacy-draft-confirmation.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(LegacyConfirmInput);
export const LegacyConfirmationApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideLegacyConfirmation = Schema.Struct({
  ...ExecuteLegacyConfirmation.fields,
  approved: Schema.Boolean,
});
export const LegacyConfirmationApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  input: LegacyConfirmInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(LegacyConfirmationReceipt),
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
export const LegacyConfirmationApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: LegacyConfirmationApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type LegacyConfirmationApprovalEnvelope = typeof LegacyConfirmationApprovalEnvelope.Type;

export const LegacyConfirmationContext = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approvalId: Uuid,
  input: LegacyConfirmInput,
  review: LegacyDraftContext,
}).check(
  Schema.makeFilter(
    (value) =>
      value.review.householdId === value.householdId &&
      value.review.draft.draftId === value.input.draftId,
  ),
);
export type LegacyConfirmationContext = typeof LegacyConfirmationContext.Type;
