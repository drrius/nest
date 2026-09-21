import * as Schema from "effect/Schema";
import { FoodPreferences, FoodProfile } from "@nest/contracts/food";
import { CookingProfile } from "@nest/contracts/cooking";
const Uuid = Schema.String.check(Schema.isUUID());
const PlanningProfile = Schema.Struct({
  revision: FoodProfile.fields.revision.check(Schema.makeFilter((value) => value !== "0")),
  restrictions: FoodPreferences.fields.restrictions,
  dislikes: FoodPreferences.fields.dislikes,
  portions: FoodPreferences.fields.portions,
});
// Deliberately API-internal: never serialize this context into a user or model tool response.
export const MealPlanningContext = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  stateHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$(?![\s\S])/)),
  members: Schema.Array(
    Schema.Struct({ actorId: Uuid, profile: Schema.NullOr(PlanningProfile) }),
  ).check(Schema.isLengthBetween(2, 2)),
  cooking: Schema.NullOr(
    CookingProfile.check(Schema.makeFilter((profile) => profile.revision !== "0")),
  ),
  requesterCalorieGoal: FoodPreferences.fields.calorieGoal,
}).check(
  Schema.makeFilter((value) => {
    const ids = value.members.map((member) => member.actorId.toLowerCase());
    const requester = value.members.find(
      (member) => member.actorId.toLowerCase() === value.actorId.toLowerCase(),
    );
    return (
      new Set(ids).size === 2 &&
      requester !== undefined &&
      (requester.profile !== null || value.requesterCalorieGoal === null)
    );
  }),
);
export type MealPlanningContext = typeof MealPlanningContext.Type;
