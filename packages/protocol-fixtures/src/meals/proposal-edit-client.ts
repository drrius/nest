import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealProposalEditCommand,
  MealProposalEdit,
  ReadMealProposalEdit,
} from "@nest/contracts/meal-proposals";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function proposalEditClient(
  request: ReturnType<typeof preferenceRequests>,
  generation: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  const bind = (result: MealProposalEdit, operation: string) => {
    if (
      result.actorId !== account.actor ||
      result.householdId !== account.household ||
      result.command.operationId !== operation.toLowerCase()
    )
      return Effect.fail(unavailable());
    return Effect.succeed(result);
  };
  return {
    execute: (input: MealProposalEditCommand) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(MealProposalEditCommand)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const common = {
          ...decoded,
          operationId: decoded.operationId.toLowerCase(),
          proposalId: decoded.proposalId.toLowerCase(),
          entryId: decoded.entryId.toLowerCase(),
        };
        const command =
          common.action === "choose"
            ? { ...common, definitionId: common.definitionId.toLowerCase() }
            : common;
        const result = yield* bind(
          yield* generation("v1/meals/proposal/edit", MealProposalEdit, command),
          command.operationId,
        );
        if (!Schema.toEquivalence(MealProposalEditCommand)(command, result.command))
          return yield* unavailable();
        return result;
      }),
    recover: (operationId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealProposalEdit)(
          { operationId },
          { onExcessProperty: "error" },
        ).pipe(Effect.mapError(invalid));
        return yield* bind(
          yield* request("v1/meals/proposal/edit/recover", MealProposalEdit, query),
          operationId,
        );
      }),
  };
}
