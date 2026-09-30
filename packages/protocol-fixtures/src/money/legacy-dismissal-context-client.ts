import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyDismissalContext } from "@nest/contracts/legacy-dismissal-approval";
import { LegacyDismissInput } from "@nest/contracts/legacy-draft-dismissal";
import { LegacyDismissalApproval } from "@nest/contracts/legacy-dismissal-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const same = Schema.toEquivalence(LegacyDismissInput);
export function legacyDismissalContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyDismissalContext: (input: typeof LegacyDismissalApproval.Type) =>
      Effect.gen(function* () {
        const approval = yield* Schema.decodeUnknownEffect(LegacyDismissalApproval)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const approvalId = approval.id.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/legacy-dismissal/approval/context?${new URLSearchParams({ approvalId })}`,
          LegacyDismissalContext,
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
