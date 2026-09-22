import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyAdoptionApprovalContext } from "@nest/contracts/legacy-adoption-approval";
import { LegacyAdoptionInput } from "@nest/contracts/legacy-adoption-command";
import { LegacyAdoptionApproval } from "@nest/contracts/legacy-adoption-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const same = Schema.toEquivalence(LegacyAdoptionInput);
export function legacyAdoptionApprovalContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyAdoptionApprovalContext: (input: typeof LegacyAdoptionApproval.Type) =>
      Effect.gen(function* () {
        const approval = yield* Schema.decodeUnknownEffect(LegacyAdoptionApproval)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const approvalId = approval.id.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/legacy-adoption/approval/context?${new URLSearchParams({ approvalId })}`,
          LegacyAdoptionApprovalContext,
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
