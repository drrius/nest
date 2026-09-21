import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProposedMealSource } from "@nest/contracts/meal-proposals";
import type { AssistantModel } from "@nest/ai/chat";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { proposalState } from "./proposal-state.ts";
import { proposalEditState, matchEdit } from "./edit-state.ts";
import { proposalEditWorker, type EditOutcome } from "./edit-worker.ts";
import { loadPlanningInput } from "./load-input.ts";
import { generateSingleMeal } from "./generate-single-meal.ts";
import { MealGenerationFailure } from "./generation-schema.ts";
import type { SingleMealGenerationInput } from "./single-meal-input.ts";
function runSingle(model: AssistantModel, input: SingleMealGenerationInput, deadline: number) {
  return Effect.gen(function* () {
    const remaining = deadline - (yield* Clock.currentTimeMillis);
    if (remaining <= 0) return { entry: null, failure: "unavailable" } as const;
    return yield* generateSingleMeal(model, input).pipe(
      Effect.timeout(remaining),
      Effect.map((entry): EditOutcome => ({ entry, failure: null })),
      Effect.catch((error) =>
        Effect.succeed<EditOutcome>({
          entry: null,
          failure:
            error instanceof MealGenerationFailure && error.reason === "no_suitable_meals"
              ? "no_suitable_meals"
              : "unavailable",
        }),
      ),
    );
  });
}
function selectionMatches(
  input: SingleMealGenerationInput,
  source: typeof ProposedMealSource.Type | null,
) {
  if (input.selection === null) return source === null;
  const recipe = input.planning.library.recipes[0];
  return (
    recipe !== undefined &&
    source !== null &&
    Schema.toEquivalence(ProposedMealSource)(source, {
      kind: "saved",
      libraryRevision: input.planning.library.revision,
      recipe,
    })
  );
}
export function editProposal(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
  options: { rpc: ReturnType<typeof planningServerRpc>; model: AssistantModel },
) {
  return Effect.gen(function* () {
    const state = proposalEditState(config, caller),
      edit = yield* state.begin(input);
    if (edit.status !== "pending") return edit;
    const current = yield* proposalState(config, caller).read(
      { proposalId: edit.command.proposalId },
      true,
    );
    const selection =
      edit.command.action === "choose"
        ? {
            definitionId: edit.command.definitionId,
            expectedRevision: edit.command.expectedLibraryRevision,
          }
        : null;
    const loaded = yield* loadPlanningInput(config, caller, options.rpc, {
      proposal: current.proposal,
      selection,
    });
    const worker = proposalEditWorker(options.rpc, caller),
      workerId = crypto.randomUUID();
    const claim = yield* worker.claim(edit, workerId);
    yield* matchEdit(edit.command, claim.edit);
    if (!claim.worker) return claim.edit;
    const single: SingleMealGenerationInput = {
      planning: loaded,
      envelope: claim.envelope,
      entryId: edit.command.entryId,
      selection: selection?.definitionId ?? null,
    };
    const outcome: EditOutcome =
      loaded.context.stateHash !== claim.worker.stateHash ||
      loaded.week.revision !== claim.envelope.proposal.weekRevision ||
      !selectionMatches(single, claim.selection)
        ? { entry: null, failure: "constraints_changed" }
        : yield* runSingle(options.model, single, claim.worker.deadline);
    return yield* worker.finish(edit, workerId, outcome);
  });
}
