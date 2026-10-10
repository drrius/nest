import * as Schema from "effect/Schema";
import { PlaceMealInput } from "@nest/contracts/meal-placement";
import type { PlacementTarget } from "./placement-runtime.ts";
export function placementTarget(params: Record<string, unknown>): PlacementTarget | null {
  const parsed = Schema.decodeUnknownExit(PlaceMealInput)({
    weekStart: params.weekStart,
    date: params.date,
    slot: params.slot,
    expectedRevision: "0",
    title: "Meal",
  });
  if (parsed._tag === "Failure") return null;
  const { weekStart, date, slot } = parsed.value;
  return { weekStart, date, slot };
}
