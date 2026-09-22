import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyAdoption,
  LegacyAdoptionInput,
  canonicalLegacyAdoption,
} from "@nest/contracts/legacy-adoption-command";
import { LegacyAdoptionRecovery } from "@nest/contracts/legacy-adoption-command";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyAdoptionInput);
export function legacyAdoptionRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveLegacyAdoption.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveLegacyAdoption)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalLegacyAdoption(command.input);
      const result = yield* cancel
        ? request("v1/money/recurring/legacy-adoption/cancel-save", LegacyAdoptionRecovery, {
            operationId,
          })
        : request(
            `v1/money/recurring/legacy-adoption/receipt?${new URLSearchParams({ operationId })}`,
            LegacyAdoptionRecovery,
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
    recoverLegacyAdoption: (input: typeof SaveLegacyAdoption.Type) => status(input, false),
    cancelLegacyAdoption: (input: typeof SaveLegacyAdoption.Type) => status(input, true),
  };
}
