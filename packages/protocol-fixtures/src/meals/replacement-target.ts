import * as Schema from "effect/Schema";
import { ReplaceMealInput } from "@nest/contracts/meal-replacement";
import type { ReplacementTarget } from "./replacement-runtime.ts";
export function replacementTarget(params: Record<string, unknown>): ReplacementTarget | null {
  const parsed = Schema.decodeUnknownExit(ReplaceMealInput)({
    entryId: params.entryId,
    weekStart: params.weekStart,
    date: params.date,
    slot: params.slot,
    expectedRevision: "0",
    title: "Meal",
  });
  if (parsed._tag === "Failure") return null;
  const { weekStart, date, slot } = parsed.value;
  return { weekStart, date, slot, entryId: parsed.value.entryId.toLowerCase() };
}
