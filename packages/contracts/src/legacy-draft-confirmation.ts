import * as Schema from "effect/Schema";
import { ExpenseInput } from "./expense.ts";
import { LegacyDraftContext, LegacyDismissInput } from "./legacy-draft-dismissal.ts";
const Uuid = LegacyDismissInput.fields.draftId;
export const LegacyConfirmInput = Schema.Struct({
  ...LegacyDismissInput.fields,
  expense: ExpenseInput.check(
    Schema.makeFilter(
      (value) => value.receiptPath === undefined && value.receiptTotalCentimes === undefined,
    ),
  ),
});
export type LegacyConfirmInput = typeof LegacyConfirmInput.Type;
export const SaveLegacyConfirmation = Schema.Struct({
  operationId: Uuid,
  input: LegacyConfirmInput,
});
export const ExecuteLegacyConfirmation = Schema.Struct({
  ...SaveLegacyConfirmation.fields,
  approvalId: Uuid,
});
export const LegacyConfirmationReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  input: LegacyConfirmInput,
  reviewed: LegacyDraftContext,
  eventId: Uuid,
  status: Schema.Literal("posted"),
}).check(
  Schema.makeFilter(
    (result) =>
      result.reviewed.householdId === result.householdId &&
      result.reviewed.reviewToken === result.input.reviewToken &&
      result.reviewed.draft.draftId === result.input.draftId &&
      result.reviewed.draft.ruleId === result.input.ruleId &&
      result.reviewed.draft.status === "pending" &&
      result.reviewed.draft.sourceKind === "recurring" &&
      result.reviewed.draft.eventId === null &&
      result.input.expense.allocations.some((share) => share.memberId === result.actorId),
  ),
);
export const LegacyConfirmationRecoveryQuery = Schema.Struct({ operationId: Uuid });
export const LegacyConfirmationRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(LegacyConfirmationReceipt),
}).check(
  Schema.makeFilter((result) => {
    const receipt = result.receipt;
    return receipt === null
      ? result.status !== "recorded"
      : result.status === "recorded" &&
          receipt.actorId === result.actorId &&
          receipt.householdId === result.householdId &&
          receipt.operationId === result.operationId &&
          receipt.approvalId === null;
  }),
);
export function canonicalLegacyConfirmation(input: LegacyConfirmInput): LegacyConfirmInput {
  return {
    ...input,
    draftId: input.draftId.toLowerCase(),
    ruleId: input.ruleId.toLowerCase(),
    expense: {
      ...input.expense,
      payerId: input.expense.payerId.toLowerCase(),
      categoryId: input.expense.categoryId?.toLowerCase() ?? null,
      allocations: [
        canonicalShare(input.expense.allocations[0]),
        canonicalShare(input.expense.allocations[1]),
      ],
    },
  };
}

function canonicalShare(share: LegacyConfirmInput["expense"]["allocations"][number]) {
  return { ...share, memberId: share.memberId.toLowerCase() };
}
