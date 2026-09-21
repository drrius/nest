import * as Schema from "effect/Schema";
import { ReadMealPreparation } from "@nest/contracts/meal-preparation-read";
import type { PreparationTarget } from "./preparation-runtime.ts";
export function preparationTarget(params: Record<string, unknown>): PreparationTarget | null {
  const parsed = Schema.decodeUnknownExit(ReadMealPreparation)({
    entryId: params.entryId,
    weekStart: params.weekStart,
    revision: "0",
  });
  return parsed._tag === "Failure"
    ? null
    : {
        entryId: parsed.value.entryId.toLowerCase(),
        weekStart: parsed.value.weekStart,
      };
}
