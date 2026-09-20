import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MealSlot = Schema.Literals(["breakfast", "lunch", "dinner"]);
export const CookingPreferences = Schema.Struct({
  cookingNotes: Schema.String.check(Schema.isMaxLength(2000)),
  mealSlots: Schema.Array(MealSlot).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(3),
    Schema.makeFilter((slots: readonly string[]) => new Set(slots).size === slots.length),
  ),
});
export type CookingPreferences = typeof CookingPreferences.Type;
export const SaveCookingPreferences = Schema.Struct({
  operationId: Uuid,
  expectedRevision: Revision,
  preferences: CookingPreferences,
});
export type SaveCookingPreferences = typeof SaveCookingPreferences.Type;
export const CookingProfile = Schema.Struct({
  revision: Revision,
  preferences: CookingPreferences,
});
export type CookingProfile = typeof CookingProfile.Type;
export const CookingProfileEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  profile: Schema.NullOr(CookingProfile),
});
export const CookingPreferenceReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  revision: Revision,
});
export const CookingSaveEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  receipt: CookingPreferenceReceipt,
});
