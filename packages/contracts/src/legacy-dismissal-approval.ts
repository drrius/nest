import { LegacyDraftContext } from "./legacy-draft-dismissal.ts";
import * as Schema from "effect/Schema";
import {
  ExecuteLegacyDismissal,
  LegacyDismissInput,
  LegacyDismissalReceipt,
} from "./legacy-draft-dismissal.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(LegacyDismissInput);
export const LegacyDismissalApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideLegacyDismissal = Schema.Struct({
  ...ExecuteLegacyDismissal.fields,
  approved: Schema.Boolean,
});
export const LegacyDismissalApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  input: LegacyDismissInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(LegacyDismissalReceipt),
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
export const LegacyDismissalApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: LegacyDismissalApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.receipt === null ||
      (value.approval.receipt.actorId === value.actorId &&
        value.approval.receipt.householdId === value.householdId),
  ),
);
export type LegacyDismissalApprovalEnvelope = typeof LegacyDismissalApprovalEnvelope.Type;

export const LegacyDismissalContext = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approvalId: Uuid,
  input: LegacyDismissInput,
  review: LegacyDraftContext,
}).check(
  Schema.makeFilter(
    (value) =>
      value.review.householdId === value.householdId &&
      value.review.draft.draftId === value.input.draftId,
  ),
);
export type LegacyDismissalContext = typeof LegacyDismissalContext.Type;
