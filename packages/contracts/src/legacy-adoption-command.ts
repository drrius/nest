import * as Schema from "effect/Schema";
import { LegacyAdoptionContext } from "./legacy-adoption.ts";
import { RecurringInput, canonicalRecurring } from "./recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
export const LegacyAdoptionInput = Schema.Struct({
  ruleId: Uuid,
  reviewToken: LegacyAdoptionContext.fields.reviewToken,
  configuration: RecurringInput.fields.configuration,
  firstDueOn: RecurringInput.fields.firstDueOn,
});
export type LegacyAdoptionInput = typeof LegacyAdoptionInput.Type;
export const SaveLegacyAdoption = Schema.Struct({ operationId: Uuid, input: LegacyAdoptionInput });
export const ExecuteLegacyAdoption = Schema.Struct({
  ...SaveLegacyAdoption.fields,
  approvalId: Uuid,
});
export const LegacyAdoptionReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  input: LegacyAdoptionInput,
  reviewed: LegacyAdoptionContext,
  revision: Uuid,
  status: Schema.Literal("active"),
}).check(
  Schema.makeFilter(
    (value) =>
      value.reviewed.householdId === value.householdId &&
      value.reviewed.rule.ruleId === value.input.ruleId &&
      value.reviewed.reviewToken === value.input.reviewToken &&
      value.reviewed.blockers.length === 0 &&
      value.reviewed.adoption === null,
  ),
);
export const LegacyAdoptionRecoveryQuery = Schema.Struct({ operationId: Uuid });
export const LegacyAdoptionRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(LegacyAdoptionReceipt),
}).check(
  Schema.makeFilter((value) =>
    value.receipt === null
      ? value.status !== "recorded"
      : value.status === "recorded" &&
        value.receipt.actorId === value.actorId &&
        value.receipt.householdId === value.householdId &&
        value.receipt.operationId === value.operationId &&
        value.receipt.approvalId === null,
  ),
);
export function canonicalLegacyAdoption(input: LegacyAdoptionInput): LegacyAdoptionInput {
  const native = canonicalRecurring({ ...input, expectedRevision: null });
  return {
    ruleId: native.ruleId,
    reviewToken: input.reviewToken,
    configuration: native.configuration,
    firstDueOn: native.firstDueOn,
  };
}
