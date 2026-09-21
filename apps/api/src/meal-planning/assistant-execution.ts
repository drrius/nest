import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  GenerateMealProposal,
  MealProposalGenerationReceipt,
  MealProposalEdit,
} from "@nest/contracts/meal-proposals";
import { CommandFailure } from "@nest/ai/tool";
import type { AssistantAction } from "@nest/contracts/assistant-actions";
import type { IdentityConfig } from "../supabase-identity.ts";
import { supabaseIdentity } from "../supabase-identity.ts";
import { currentMember, bearerToken } from "../identity.ts";
import type { MealPlanningOptions } from "./route.ts";
import { planningServerRpc } from "./server-rpc.ts";
import { generateProposal } from "./generate-proposal.ts";
import { editProposal } from "./edit-proposal.ts";
import type { assistantCommands } from "../assistant/commands.ts";
const planningAction = (action: AssistantAction) =>
  ["generateMealProposal", "replaceProposalMeal", "chooseProposalRecipe"].includes(action);
export function planningCommands(
  request: Request,
  config: IdentityConfig,
  execute: ReturnType<typeof assistantCommands>,
  options: MealPlanningOptions,
) {
  const rpc = options.planningSecret
    ? planningServerRpc(config, options.planningSecret)
    : undefined;
  return (action: AssistantAction, input: unknown, call: string) =>
    Effect.gen(function* () {
      // No reservation is made when this deployment cannot perform model work.
      if (planningAction(action) && (!rpc || !options.model))
        return yield* new CommandFailure({ code: "unavailable" });
      const receipt = yield* execute(action, input, call);
      if (!planningAction(action) || !rpc || !options.model) return receipt;
      const caller = { member: yield* currentMember(request), token: yield* bearerToken(request) };
      if (action === "generateMealProposal") {
        const saved = yield* Schema.decodeUnknownEffect(MealProposalGenerationReceipt)(receipt);
        const command = yield* Schema.decodeUnknownEffect(GenerateMealProposal)({
          operationId: saved.operationId,
          weekStart: saved.weekStart,
          expectedWeekRevision: saved.expectedWeekRevision,
          familiarOnly: saved.familiarOnly,
        });
        yield* generateProposal(config, caller, command, { rpc, model: options.model });
      } else {
        const saved = yield* Schema.decodeUnknownEffect(MealProposalEdit)(receipt);
        yield* editProposal(config, caller, saved.command, { rpc, model: options.model });
      }
      // The journal records reservation, never a mutable claim about later completion.
      return receipt;
    }).pipe(
      Effect.provide(supabaseIdentity(config)),
      Effect.mapError((error) =>
        Schema.is(CommandFailure)(error) ? error : new CommandFailure({ code: "unavailable" }),
      ),
    );
}
