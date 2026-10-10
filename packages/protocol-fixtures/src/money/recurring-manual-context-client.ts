import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManualCycleContext } from "@nest/contracts/recurring-manual-context";
import { ManualCycleInput } from "@nest/contracts/recurring-manual";
import { ManualCycleApproval } from "@nest/contracts/recurring-manual-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const same = Schema.toEquivalence(ManualCycleInput);
export function manualCycleContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    manualCycleContext: (input: typeof ManualCycleApproval.Type) =>
      Effect.gen(function* () {
        const approval = yield* Schema.decodeUnknownEffect(ManualCycleApproval)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const approvalId = approval.id.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/manual/approval/context?${new URLSearchParams({ approvalId })}`,
          ManualCycleContext,
        );
        if (
          result.actorId !== account.actor ||
          result.householdId !== account.household ||
          result.approvalId !== approvalId ||
          !same(result.input, approval.input)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
