import * as Schema from "effect/Schema";
import { PlaceMealInput, MealPlacementReceipt } from "./meal-placement.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const placementValid = (value: PlaceMealInput) => Schema.is(PlaceMealInput)(value);
const revisionCapacity = (value: { expectedRevision: string }) =>
  BigInt(value.expectedRevision) <= 9223372036854775805n;
export const ReplaceMealInput = Schema.Struct({
  ...PlaceMealInput.fields,
  entryId: Uuid,
}).check(Schema.makeFilter(placementValid), Schema.makeFilter(revisionCapacity));
export type ReplaceMealInput = typeof ReplaceMealInput.Type;
export const ReplaceMeal = Schema.Struct({
  operationId: Uuid,
  ...ReplaceMealInput.fields,
}).check(Schema.makeFilter(placementValid), Schema.makeFilter(revisionCapacity));
export type ReplaceMeal = typeof ReplaceMeal.Type;
export const MealReplacementReceipt = Schema.Struct({
  ...MealPlacementReceipt.fields,
  previousEntryId: Uuid,
  skippedPreparationId: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter((value) => Schema.is(MealPlacementReceipt)(value)),
  Schema.makeFilter((value) => BigInt(value.revision) >= 2n),
  Schema.makeFilter((value) => value.previousEntryId.toLowerCase() !== value.entryId.toLowerCase()),
);
export type MealReplacementReceipt = typeof MealReplacementReceipt.Type;
