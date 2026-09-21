import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealProposal,
  MealProposalEdit,
  MealProposalEnvelope,
  ProposedMealSource,
  type ProposedMeal,
} from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { bindEnvelope, decodeProposal } from "./proposal-state.ts";
import { bindEdit, matchEdit } from "./edit-state.ts";
const Claim = Schema.Struct({
  claimed: Schema.Boolean,
  worker: Schema.NullOr(
    Schema.Struct({
      id: Schema.String.check(Schema.isUUID()),
      deadline: MealProposal.fields.expiresAt,
      stateHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    }),
  ),
  edit: MealProposalEdit,
  envelope: MealProposalEnvelope,
  selection: Schema.NullOr(ProposedMealSource),
}).check(Schema.makeFilter((v) => v.claimed === (v.worker !== null)));
export type EditOutcome =
  | { entry: ProposedMeal; failure: null }
  | { entry: null; failure: NonNullable<MealProposalEdit["failure"]> };
function validSelection(claim: typeof Claim.Type) {
  const command = claim.edit.command;
  if (!claim.claimed || command.action === "replace") return claim.selection === null;
  return (
    claim.selection?.kind === "saved" &&
    claim.selection.recipe.definitionId === command.definitionId &&
    claim.selection.libraryRevision === command.expectedLibraryRevision
  );
}
function validWorker(claim: typeof Claim.Type, edit: MealProposalEdit, workerId: string) {
  if (!claim.worker) return true;
  return (
    claim.worker.id === workerId &&
    claim.worker.deadline === edit.expiresAt &&
    claim.edit.status === "pending" &&
    claim.envelope.proposal.status === "ready" &&
    claim.envelope.proposal.revision === edit.command.expectedRevision
  );
}
export function proposalEditWorker(
  rpc: ReturnType<typeof planningServerRpc>,
  caller: AuthorizedCaller,
) {
  const scope = { p_actor: caller.member.userId, p_household: caller.member.householdId };
  return {
    claim: (edit: MealProposalEdit, workerId: string) =>
      Effect.gen(function* () {
        const claim = yield* decodeProposal(
          Claim,
          yield* rpc("editClaim", {
            ...scope,
            p_operation: edit.command.operationId,
            p_worker: workerId,
          }),
        );
        yield* bindEdit(caller, edit.command.operationId, claim.edit);
        yield* matchEdit(edit.command, claim.edit);
        yield* bindEnvelope(caller, edit.command.proposalId, claim.envelope);
        if (
          claim.edit.expiresAt !== edit.expiresAt ||
          !validWorker(claim, edit, workerId) ||
          !validSelection(claim)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return claim;
      }),
    finish: (edit: MealProposalEdit, workerId: string, outcome: EditOutcome) =>
      Effect.gen(function* () {
        const completed = yield* bindEdit(
          caller,
          edit.command.operationId,
          yield* rpc("editFinish", {
            ...scope,
            p_operation: edit.command.operationId,
            p_outcome: { workerId, ...outcome },
          }),
        );
        yield* matchEdit(edit.command, completed);
        if (completed.expiresAt !== edit.expiresAt || completed.status === "pending")
          return yield* new ApiFailure({ code: "unavailable" });
        if (outcome.failure === null && completed.failure === "no_suitable_meals")
          return yield* new ApiFailure({ code: "unavailable" });
        if (
          outcome.failure !== null &&
          (completed.status === "applied" ||
            ![outcome.failure, "unavailable"].includes(completed.failure!))
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return completed;
      }),
  };
}
