import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealProposalEdit,
  MealProposalEditCommand,
  ReadMealProposalEdit,
} from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decodeProposal } from "./proposal-state.ts";
export function canonicalEdit(command: MealProposalEditCommand): MealProposalEditCommand {
  const common = {
    ...command,
    operationId: command.operationId.toLowerCase(),
    proposalId: command.proposalId.toLowerCase(),
    entryId: command.entryId.toLowerCase(),
  };
  return common.action === "choose"
    ? { ...common, definitionId: common.definitionId.toLowerCase() }
    : common;
}
export function bindEdit(caller: AuthorizedCaller, operation: string, value: unknown) {
  return Effect.gen(function* () {
    const edit = yield* decodeProposal(MealProposalEdit, value);
    if (
      edit.actorId !== caller.member.userId ||
      edit.householdId !== caller.member.householdId ||
      edit.command.operationId !== operation.toLowerCase()
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return edit;
  });
}
export function matchEdit(command: MealProposalEditCommand, edit: MealProposalEdit) {
  return Schema.toEquivalence(MealProposalEditCommand)(canonicalEdit(command), edit.command)
    ? Effect.succeed(edit)
    : Effect.fail(new ApiFailure({ code: "unavailable" }));
}
export function proposalEditState(config: IdentityConfig, caller: AuthorizedCaller) {
  const request = (name: string, operation: string, input?: unknown) =>
    requestJson(config, caller.token, `rest/v1/rpc/${name}`, {
      p_household: caller.member.householdId,
      p_operation: operation,
      ...(input === undefined ? {} : { p_input: input }),
    });
  return {
    begin: (input: unknown) =>
      Effect.gen(function* () {
        const command = canonicalEdit(
          yield* decodeProposal(MealProposalEditCommand, input, "invalid_request"),
        );
        const { operationId, ...payload } = command;
        const edit = yield* bindEdit(
          caller,
          operationId,
          yield* request("nest_begin_proposal_edit", operationId, payload),
        );
        return yield* matchEdit(command, edit);
      }),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decodeProposal(ReadMealProposalEdit, input, "invalid_request");
        return yield* bindEdit(
          caller,
          command.operationId,
          yield* request("nest_read_proposal_edit", command.operationId.toLowerCase()),
        );
      }),
  };
}
