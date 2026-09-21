import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { MealProposalGenerationResult } from "@nest/contracts/meal-proposals";
import type { AssistantModel } from "@nest/ai/chat";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { proposalState, decodeProposal } from "./proposal-state.ts";
import { proposalWorker, type ProposalOutcome } from "./worker-store.ts";
import { loadGenerationInput } from "./load-input.ts";
import { generateMealContent } from "./generate.ts";
import { MealGenerationFailure, type PlanningGenerationInput } from "./generation-schema.ts";
function generateOutcome(model: AssistantModel, input: PlanningGenerationInput, deadline: number) {
  return Effect.gen(function* () {
    const remaining = deadline - (yield* Clock.currentTimeMillis);
    if (remaining <= 0) return { content: null, failure: "unavailable" } as const;
    return yield* generateMealContent(model, input).pipe(
      Effect.timeout(remaining),
      Effect.map((content): ProposalOutcome => ({ content, failure: null })),
      Effect.catch((error) =>
        Effect.succeed<ProposalOutcome>({
          content: null,
          failure:
            error instanceof MealGenerationFailure && error.reason !== "week_full"
              ? error.reason
              : "unavailable",
        }),
      ),
    );
  });
}
export function generateProposal(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
  options: { rpc: ReturnType<typeof planningServerRpc>; model: AssistantModel },
) {
  return Effect.gen(function* () {
    const state = proposalState(config, caller);
    const receipt = yield* state.begin(input);
    const current = yield* state.read({ proposalId: receipt.proposalId }, true);
    const result = (envelope: typeof current) =>
      decodeProposal(MealProposalGenerationResult, { version: 1, receipt, envelope });
    // Validate the current state against the immutable original request before loading private data.
    yield* result(current);
    if (current.proposal.status !== "generating") return yield* result(current);
    const loaded = yield* loadGenerationInput(config, caller, options.rpc, current.proposal);
    const worker = proposalWorker(options.rpc, caller),
      workerId = crypto.randomUUID();
    const claim = yield* worker.claim(current.proposal, workerId);
    yield* result(claim.envelope);
    if (!claim.worker) return yield* result(claim.envelope);
    const outcome: ProposalOutcome =
      loaded.context.stateHash !== claim.worker.stateHash ||
      loaded.week.revision !== current.proposal.weekRevision
        ? { content: null, failure: "constraints_changed" }
        : yield* generateOutcome(options.model, loaded, claim.worker.deadline);
    const completed = yield* worker.finish(claim.envelope.proposal, workerId, outcome);
    return yield* result(completed);
  });
}
