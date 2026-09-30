import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyDismissal,
  LegacyDismissInput,
  canonicalLegacyDismissal,
} from "@nest/contracts/legacy-draft-dismissal";
import { LegacyDismissalRecovery } from "@nest/contracts/legacy-draft-dismissal";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyDismissInput);
export function legacyDismissalRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveLegacyDismissal.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveLegacyDismissal)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalLegacyDismissal(command.input);
      const result = yield* cancel
        ? request("v1/money/recurring/legacy-dismissal/cancel-save", LegacyDismissalRecovery, {
            operationId,
          })
        : request(
            `v1/money/recurring/legacy-dismissal/receipt?${new URLSearchParams({ operationId })}`,
            LegacyDismissalRecovery,
          );
      if (
        result.actorId !== account.actor ||
        result.householdId !== account.household ||
        result.operationId !== operationId ||
        (result.receipt !== null && !equivalent(result.receipt.input, change)) ||
        (cancel && result.status === "unresolved")
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
  return {
    recoverLegacyDismissal: (input: typeof SaveLegacyDismissal.Type) => status(input, false),
    cancelLegacyDismissal: (input: typeof SaveLegacyDismissal.Type) => status(input, true),
  };
}
