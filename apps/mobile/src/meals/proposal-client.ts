import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  GenerateMealProposal,
  MealProposalGenerationReceipt,
  MealProposalGenerationResult,
  MealProposalEnvelope,
  ReadMealProposal,
  DiscardMealProposal,
  MealProposalDiscardReceipt,
} from "@nest/contracts/meal-proposals";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Start = Schema.Struct({ version: Schema.Literal(1), receipt: MealProposalGenerationReceipt });
const Discarded = Schema.Struct({
  version: Schema.Literal(1),
  receipt: MealProposalDiscardReceipt,
});
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function mealProposalClient(
  request: ReturnType<typeof preferenceRequests>,
  generation: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  const own = (value: { actorId: string; householdId: string }) =>
    value.actorId === account.actor && value.householdId === account.household;
  const start = (input: GenerateMealProposal, run: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(GenerateMealProposal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(invalid));
      const result = run
        ? yield* generation("v1/meals/proposal/generate", MealProposalGenerationResult, command)
        : yield* request("v1/meals/proposal/reserve", Start, command);
      const receipt = result.receipt;
      if (
        !own(receipt) ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.weekStart !== command.weekStart ||
        receipt.expectedWeekRevision !== command.expectedWeekRevision ||
        receipt.familiarOnly !== command.familiarOnly
      )
        return yield* unavailable();
      return result;
    });
  return {
    reserve: (input: GenerateMealProposal) =>
      start(input, false).pipe(Effect.map((result) => result.receipt)),
    generate: (input: GenerateMealProposal) =>
      start(input, true).pipe(
        Effect.flatMap((result) =>
          Schema.decodeUnknownEffect(MealProposalGenerationResult)(result, {
            onExcessProperty: "error",
          }).pipe(Effect.mapError(unavailable)),
        ),
      ),
    recover: (proposalId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealProposal)({ proposalId }).pipe(
          Effect.mapError(invalid),
        );
        const envelope = yield* request("v1/meals/proposal/recover", MealProposalEnvelope, query);
        if (!own(envelope) || envelope.proposal.proposalId !== proposalId.toLowerCase())
          return yield* unavailable();
        return envelope;
      }),
    discard: (input: typeof DiscardMealProposal.Type) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(DiscardMealProposal)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const { receipt } = yield* request("v1/meals/proposal/discard", Discarded, command);
        if (
          !own(receipt) ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.proposalId !== command.proposalId.toLowerCase() ||
          receipt.previousRevision !== command.expectedRevision
        )
          return yield* unavailable();
        return receipt;
      }),
  };
}
export type MealProposalClient = ReturnType<typeof mealProposalClient>;
