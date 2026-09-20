import * as Schema from "effect/Schema";
import { RemoveMealInput } from "@nest/contracts/meal-removal";
import type { RemovalTarget } from "./removal-runtime.ts";
export function removalTarget(params: Record<string, unknown>): RemovalTarget | null {
  const parsed = Schema.decodeUnknownExit(RemoveMealInput)({
    weekStart: params.weekStart,
    entryId: params.entryId,
    expectedRevision: "0",
  });
  if (parsed._tag === "Failure") return null;
  return { weekStart: parsed.value.weekStart, entryId: parsed.value.entryId.toLowerCase() };
}
