import * as Schema from "effect/Schema";
import { MoveMealInput, MoveMeal, MealMoveReceipt } from "./meal-move.ts";
// The same exact source/destination baseline contract; entryId names the source meal.
export const PlaceLeftoversInput = MoveMealInput;
export const PlaceLeftovers = MoveMeal;
export const LeftoverPlacementReceipt = Schema.Struct({
  ...MealMoveReceipt.fields,
  sourceEntryId: MoveMealInput.fields.entryId,
}).check(
  Schema.makeFilter(
    (value) => value.entryId !== value.sourceEntryId && value.targetRevision !== "0",
  ),
  Schema.makeFilter((value) =>
    Schema.is(MoveMealInput)({
      entryId: value.sourceEntryId,
      sourceWeekStart: value.sourceWeekStart,
      expectedSourceRevision: value.sourceRevision,
      targetWeekStart: value.targetWeekStart,
      expectedTargetRevision: value.targetRevision,
      date: value.date,
      slot: value.slot,
    }),
  ),
);
export type PlaceLeftoversInput = typeof PlaceLeftoversInput.Type;
export type PlaceLeftovers = typeof PlaceLeftovers.Type;
export type LeftoverPlacementReceipt = typeof LeftoverPlacementReceipt.Type;
