import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealProposal,
  MealProposalEnvelope,
  MealProposalContent,
} from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { bindEnvelope, decodeProposal } from "./proposal-state.ts";
const Worker = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  deadline: MealProposal.fields.expiresAt,
  stateHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
const Claim = Schema.Struct({
  claimed: Schema.Boolean,
  worker: Schema.NullOr(Worker),
  envelope: MealProposalEnvelope,
}).check(
  Schema.makeFilter(
    (v) =>
      v.claimed === (v.worker !== null) &&
      (!v.claimed || v.envelope.proposal.status === "generating"),
  ),
);
export type ProposalOutcome =
  | { content: MealProposalContent; failure: null }
  | {
      content: null;
      failure: Exclude<MealProposal["failure"], null>;
    };
export function proposalWorker(
  rpc: ReturnType<typeof planningServerRpc>,
  caller: AuthorizedCaller,
) {
  const scope = { p_actor: caller.member.userId, p_household: caller.member.householdId };
  return {
    claim: (proposal: MealProposal, workerId: string) =>
      Effect.gen(function* () {
        const claim = yield* decodeProposal(
          Claim,
          yield* rpc("claim", { ...scope, p_proposal: proposal.proposalId, p_worker: workerId }),
        );
        yield* bindEnvelope(caller, proposal.proposalId, claim.envelope);
        if (
          claim.worker &&
          (claim.worker.id !== workerId || claim.envelope.proposal.revision !== proposal.revision)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return claim;
      }),
    finish: (proposal: MealProposal, workerId: string, outcome: ProposalOutcome) =>
      Effect.gen(function* () {
        const envelope = yield* bindEnvelope(
          caller,
          proposal.proposalId,
          yield* rpc("finish", {
            ...scope,
            p_proposal: proposal.proposalId,
            p_outcome: { workerId, expectedRevision: proposal.revision, ...outcome },
          }),
        );
        const result = envelope.proposal;
        if (
          result.revision !== (BigInt(proposal.revision) + 1n).toString() ||
          result.weekStart !== proposal.weekStart ||
          result.weekRevision !== proposal.weekRevision ||
          result.familiarOnly !== proposal.familiarOnly ||
          result.expiresAt !== proposal.expiresAt ||
          !["ready", "failed"].includes(result.status)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        if (!matchesOutcome(result, outcome)) return yield* new ApiFailure({ code: "unavailable" });
        return envelope;
      }),
  };
}

function matchesOutcome(result: MealProposal, outcome: ProposalOutcome) {
  if (result.status === "failed")
    return (
      result.failure === "unavailable" ||
      result.failure === (outcome.failure ?? "constraints_changed")
    );
  return (
    outcome.content !== null &&
    result.entries !== null &&
    Schema.toEquivalence(MealProposalContent)(outcome.content, {
      ...result,
      entries: result.entries,
    })
  );
}
