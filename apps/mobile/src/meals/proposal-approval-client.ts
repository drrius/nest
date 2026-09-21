import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApproveMealProposal, MealProposalApprovalReceipt } from "@nest/contracts/meal-proposals";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Approved = Schema.Struct({
  version: Schema.Literal(1),
  receipt: MealProposalApprovalReceipt,
});
export function approveMealProposal(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
  input: ApproveMealProposal,
) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(ApproveMealProposal)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
    const { receipt } = yield* request("v1/meals/proposal/approve", Approved, command);
    if (
      receipt.actorId !== account.actor ||
      receipt.householdId !== account.household ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.proposalId !== command.proposalId.toLowerCase() ||
      receipt.approvedRevision !== command.expectedRevision
    )
      return yield* new PreferenceFailure({ code: "unavailable" });
    return receipt;
  });
}
