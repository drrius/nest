import * as Effect from "effect/Effect";
import { ReadMealProposal, ReadMealProposalEdit } from "@nest/contracts/meal-proposals";
import type { AssistantAction } from "@nest/contracts/assistant-actions";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { openProposal } from "./open-proposal.ts";
import { proposalEditState } from "./edit-state.ts";
export function proposalReadTools(request: Request, config: IdentityConfig) {
  const caller = Effect.gen(function* () {
    return { member: yield* currentMember(request), token: yield* bearerToken(request) };
  });
  return {
    readMealProposal: effectTool({
      description:
        "Read only your private meal proposal's current state and original request identity. Use the native preview card for explicit approval; this read never generates or approves. A reservation receipt is not a ready plan. Read fresh after generation, replacement or discard and before describing current contents. Saved shared meals and groceries require separate actions.",
      input: ReadMealProposal,
      execute: (input) =>
        caller.pipe(
          Effect.flatMap((scope) => openProposal(config, scope, input)),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(toolFailure),
        ),
    }),
    readMealProposalEdit: effectTool({
      description:
        "Recover your original proposal edit by its journal-provided operation ID. A pending reservation does not prove completion. This read never generates again; after terminal status readMealProposal for current content. Do not invent operation IDs or retry an uncertain edit with a new invocation.",
      input: ReadMealProposalEdit,
      execute: (input) =>
        caller.pipe(
          Effect.flatMap((scope) => proposalEditState(config, scope).read(input)),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(toolFailure),
        ),
    }),
  };
}
function toolFailure(error: { code: string }) {
  return new CommandFailure({
    code:
      error.code === "conflict"
        ? "conflict"
        : error.code === "unavailable"
          ? "unavailable"
          : "forbidden",
  });
}
export function proposalWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    generateMealProposal: write(
      "generateMealProposal",
      "Generate a private preview only when explicitly requested. Read the meal week and both available food/cooking setup first; use its exact Monday and revision. Ask about an unclear week. Respect saved-only choice; existing meals remain. The returned receipt confirms reservation, not readiness: readMealProposal afterward. On uncertainty recover this proposal, never issue another generation. No meals or groceries are saved until separate native approvals. Never use immediate placement to bypass plan approval.",
    ),
    replaceProposalMeal: write(
      "replaceProposalMeal",
      "Replace one private preview suggestion only when explicitly requested. Read the current proposal first and use its exact ready revision and entry ID. Other suggestions stay unchanged. The result is an immutable edit reservation: readMealProposalEdit for its result and readMealProposal for current content. Never regenerate the week or issue a new edit after uncertainty. No plan approval, meals or groceries are created.",
    ),
    chooseProposalRecipe: write(
      "chooseProposalRecipe",
      "Use an explicitly selected saved recipe for one private proposal entry. Read the proposal and exact library recipe fresh; preserve both revisions. Only its dietary suitability is checked; the recipe is not rewritten. The result confirms reservation only; recover the edit and reread the proposal. On uncertainty reuse original operation recovery, never create another edit. Native plan approval is separate.",
    ),
    discardMealProposal: write(
      "discardMealProposal",
      "Discard only the private proposal explicitly requested by the member, after reading its current revision. This keeps saved meals, groceries and history unchanged. On uncertainty recover the original proposal and journaled invocation. Reread before claiming current status; this action cannot approve a plan.",
    ),
  };
}
