import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  GenerateMealProposal,
  MealProposalGenerationReceipt,
  MealProposalEnvelope,
  ReadMealProposal,
  DiscardMealProposal,
  MealProposalDiscardReceipt,
} from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export const decodeProposal = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: "unavailable" | "invalid_request" = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function bindEnvelope(caller: AuthorizedCaller, proposalId: string, value: unknown) {
  return Effect.gen(function* () {
    const envelope = yield* decodeProposal(MealProposalEnvelope, value);
    if (
      envelope.actorId !== caller.member.userId ||
      envelope.householdId !== caller.member.householdId ||
      envelope.proposal.proposalId !== proposalId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return envelope;
  });
}
export function proposalState(config: IdentityConfig, caller: AuthorizedCaller) {
  const owner = (
    r: { actorId: string; householdId: string; operationId: string },
    operation: string,
  ) =>
    r.actorId === caller.member.userId &&
    r.householdId === caller.member.householdId &&
    r.operationId === operation.toLowerCase();
  return {
    begin: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decodeProposal(GenerateMealProposal, input, "invalid_request");
        const { operationId, ...payload } = command;
        const request = {
          p_household: caller.member.householdId,
          p_operation: operationId.toLowerCase(),
          p_input: payload,
        };
        const saved = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_read_meal_reservation",
          request,
        );
        const raw =
          saved === null
            ? yield* requestJson(
                config,
                caller.token,
                "rest/v1/rpc/nest_begin_meal_proposal",
                request,
              )
            : saved;
        const receipt = yield* decodeProposal(MealProposalGenerationReceipt, raw);
        if (
          !owner(receipt, operationId) ||
          receipt.weekStart !== command.weekStart ||
          receipt.expectedWeekRevision !== command.expectedWeekRevision ||
          receipt.familiarOnly !== command.familiarOnly
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
    read: (input: unknown, recover = false) => readProposalState(config, caller, input, recover),
    discard: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decodeProposal(DiscardMealProposal, input, "invalid_request");
        const { operationId, ...payload } = command;
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_discard_meal_proposal",
          {
            p_household: caller.member.householdId,
            p_operation: operationId.toLowerCase(),
            p_input: { ...payload, proposalId: command.proposalId.toLowerCase() },
          },
        );
        const receipt = yield* decodeProposal(MealProposalDiscardReceipt, raw);
        if (
          !owner(receipt, operationId) ||
          receipt.proposalId !== command.proposalId.toLowerCase() ||
          receipt.previousRevision !== command.expectedRevision
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}

function readProposalState(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
  recover: boolean,
) {
  return Effect.gen(function* () {
    const command = yield* decodeProposal(ReadMealProposal, input, "invalid_request");
    const proposalId = command.proposalId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_meal_proposal", {
      p_household: caller.member.householdId,
      p_proposal: proposalId,
    });
    const saved = yield* bindEnvelope(caller, proposalId, raw);
    // Completed state is a read. Only unfinished generation needs expiry/worker recovery.
    if (!recover || saved.proposal.status !== "generating") return saved;
    const recovered = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_recover_meal_proposal",
      { p_household: caller.member.householdId, p_proposal: proposalId },
    );
    return yield* bindEnvelope(caller, proposalId, recovered);
  });
}
