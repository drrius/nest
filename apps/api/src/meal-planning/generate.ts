import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { AssistantModel } from "@nest/ai/chat";
import { MealProposalContent } from "@nest/contracts/meal-proposals";
import { PlanningGenerationInput, MealGenerationFailure } from "./generation-schema.ts";
import { prepareGeneration } from "./generation-input.ts";
import { generatePreparedMeals } from "./generate-entries.ts";
const failure = (error: unknown) =>
  error instanceof MealGenerationFailure
    ? error
    : new MealGenerationFailure({ reason: "unavailable" });
// Internal orchestration only: callers must supply freshly authorized reads and reserve a
// private operation before calling. It does not persist or approve content or expose a route.
export function generateMealContent(
  model: AssistantModel,
  value: unknown,
  makeId = () => crypto.randomUUID(),
) {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(PlanningGenerationInput, {
      onExcessProperty: "error",
    })(value);
    const input = structuredClone(decoded);
    const now = yield* Clock.currentTimeMillis;
    const prepared = yield* Effect.try({
      try: () => prepareGeneration(input, now),
      catch: failure,
    });
    const entries = yield* generatePreparedMeals(model, input, prepared);
    const identified = yield* Effect.try({
      try: () => entries.map((entry) => ({ ...entry, entryId: makeId() })),
      catch: failure,
    });
    return yield* Schema.decodeUnknownEffect(MealProposalContent, { onExcessProperty: "error" })({
      weekStart: input.week.weekStart,
      familiarOnly: input.familiarOnly,
      entries: identified,
    });
  }).pipe(Effect.mapError(failure));
}
