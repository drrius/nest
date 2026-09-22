import { legacyDismissalApprovalClient } from "./legacy-dismissal-approval-client.ts";
import { legacyDismissalContextClient } from "./legacy-dismissal-context-client.ts";
import { legacyDraftContextClient } from "./legacy-draft-context-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyDismissal,
  LegacyDismissInput,
  LegacyDismissalReceipt,
  canonicalLegacyDismissal,
} from "@nest/contracts/legacy-draft-dismissal";
import { legacyDismissalRecoveryClient } from "./legacy-dismissal-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyDismissInput);
export type LegacyDismissalSave = typeof SaveLegacyDismissal.Type;
export function legacyDismissalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...legacyDismissalApprovalClient(apiUrl, account, credentials),
    ...legacyDismissalContextClient(apiUrl, account, credentials),
    ...legacyDraftContextClient(apiUrl, account, credentials),
    ...legacyDismissalRecoveryClient(apiUrl, account, credentials),
    saveLegacyDismissal: (input: LegacyDismissalSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveLegacyDismissal)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalLegacyDismissal(command.input);
        const result = yield* request(
          "v1/money/recurring/legacy-dismissal/save",
          LegacyDismissalReceipt,
          {
            operationId,
            input: change,
          },
        );
        if (
          result.actorId !== account.actor ||
          result.householdId !== account.household ||
          result.operationId !== operationId ||
          result.approvalId !== null ||
          !equivalent(result.input, change)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
