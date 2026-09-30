import * as Schema from "effect/Schema";
import { MoveMealInput } from "@nest/contracts/meal-move";
import type { MoveTarget } from "./move-runtime.ts";
export function moveTarget(params: Record<string, unknown>): MoveTarget | null {
  const parsed = Schema.decodeUnknownExit(MoveMealInput)({
    sourceWeekStart: params.sourceWeekStart,
    entryId: params.entryId,
    expectedSourceRevision: "0",
    expectedTargetRevision: "0",
    targetWeekStart: params.sourceWeekStart,
    date: params.sourceWeekStart,
    slot: "dinner",
  });
  if (parsed._tag === "Failure") return null;
  return {
    sourceWeekStart: parsed.value.sourceWeekStart,
    entryId: parsed.value.entryId.toLowerCase(),
  };
}
