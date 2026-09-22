import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyConfirmation,
  LegacyConfirmInput,
  canonicalLegacyConfirmation,
} from "@nest/contracts/legacy-draft-confirmation";
import { LegacyConfirmationRecovery } from "@nest/contracts/legacy-draft-confirmation";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyConfirmInput);
export function legacyConfirmationRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveLegacyConfirmation.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveLegacyConfirmation)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalLegacyConfirmation(command.input);
      const result = yield* cancel
        ? request(
            "v1/money/recurring/legacy-confirmation/cancel-save",
            LegacyConfirmationRecovery,
            {
              operationId,
            },
          )
        : request(
            `v1/money/recurring/legacy-confirmation/receipt?${new URLSearchParams({ operationId })}`,
            LegacyConfirmationRecovery,
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
    recoverLegacyConfirmation: (input: typeof SaveLegacyConfirmation.Type) => status(input, false),
    cancelLegacyConfirmation: (input: typeof SaveLegacyConfirmation.Type) => status(input, true),
  };
}
