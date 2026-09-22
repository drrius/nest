import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyConfirmationContext } from "@nest/contracts/legacy-confirmation-approval";
import { LegacyConfirmInput } from "@nest/contracts/legacy-draft-confirmation";
import { LegacyConfirmationApproval } from "@nest/contracts/legacy-confirmation-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const same = Schema.toEquivalence(LegacyConfirmInput);
export function legacyConfirmationContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyConfirmationContext: (input: typeof LegacyConfirmationApproval.Type) =>
      Effect.gen(function* () {
        const approval = yield* Schema.decodeUnknownEffect(LegacyConfirmationApproval)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const approvalId = approval.id.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/legacy-confirmation/approval/context?${new URLSearchParams({ approvalId })}`,
          LegacyConfirmationContext,
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
