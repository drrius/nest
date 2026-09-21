import * as Effect from "effect/Effect";
import type { MealProposal } from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { readMealLibrary, readSavedMeal } from "../meals/library-read.ts";
import { readMealWeek } from "../meals/read.ts";
import { readBusySnapshots } from "../calendar/read.ts";
import { readPlanningContext } from "./read-context.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { PlanningGenerationInput } from "./generation-schema.ts";
import { decodeProposal } from "./proposal-state.ts";
function shortlist(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    // A bounded authorized shortlist; this is not an exhaustive library search.
    const page = yield* readMealLibrary(config, caller, { afterId: null, expectedRevision: null });
    const details = yield* Effect.forEach(
      page.meals,
      (meal) =>
        readSavedMeal(config, caller, {
          definitionId: meal.definitionId,
          expectedRevision: page.revision,
        }),
      { concurrency: 4 },
    );
    const recipes = details.flatMap(({ recipe }) =>
      recipe?.servings && recipe.instructions?.trim() && recipe.ingredients.length ? [recipe] : [],
    );
    return { householdId: page.householdId, revision: page.revision, recipes };
  });
}
export function loadGenerationInput(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  rpc: ReturnType<typeof planningServerRpc>,
  proposal: MealProposal,
) {
  return Effect.gen(function* () {
    const reads = yield* Effect.all(
      {
        context: readPlanningContext(rpc, caller.member),
        week: readMealWeek(config, caller, { weekStart: proposal.weekStart }),
        library: shortlist(config, caller),
        busy: readBusySnapshots(config, caller),
      },
      { concurrency: 4 },
    );
    return yield* decodeProposal(PlanningGenerationInput, {
      ...reads,
      familiarOnly: proposal.familiarOnly,
    });
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.mapError((error) =>
      error instanceof ApiFailure ? error : new ApiFailure({ code: "unavailable" }),
    ),
  );
}
