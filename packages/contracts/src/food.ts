import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const FoodText = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
  Schema.makeFilter((value: string) => value.trim().length > 0),
);
export const FoodPreferences = Schema.Struct({
  restrictions: Schema.Array(FoodText).check(Schema.isMaxLength(32)),
  dislikes: Schema.Array(FoodText).check(Schema.isMaxLength(32)),
  calorieGoal: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20000 }))),
  portions: Schema.Literals([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
});
export type FoodPreferences = typeof FoodPreferences.Type;
export const SaveFoodPreferences = Schema.Struct({
  operationId: Uuid,
  expectedRevision: Revision,
  preferences: FoodPreferences,
});
export type SaveFoodPreferences = typeof SaveFoodPreferences.Type;
export const FoodProfile = Schema.Struct({
  revision: Revision,
  preferences: FoodPreferences,
});
export type FoodProfile = typeof FoodProfile.Type;
export const FoodProfileEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  profile: Schema.NullOr(FoodProfile),
});
export const FoodPreferenceReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  revision: Revision,
});
export const FoodSaveEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  receipt: FoodPreferenceReceipt,
});
