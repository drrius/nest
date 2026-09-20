import * as Schema from "effect/Schema";
import { MealWeekStart } from "./meals.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const RemoveMealInput = Schema.Struct({
  entryId: Uuid,
  weekStart: MealWeekStart,
  expectedRevision: Revision,
});
export type RemoveMealInput = typeof RemoveMealInput.Type;
export const RemoveMeal = Schema.Struct({ operationId: Uuid, ...RemoveMealInput.fields });
export type RemoveMeal = typeof RemoveMeal.Type;
export const MealRemovalReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  entryId: Uuid,
  weekStart: MealWeekStart,
  revision: Revision,
  removed: Schema.Literal(true),
  skippedPreparationId: Schema.NullOr(Uuid),
}).check(Schema.makeFilter((value) => value.revision !== "0"));
export type MealRemovalReceipt = typeof MealRemovalReceipt.Type;
