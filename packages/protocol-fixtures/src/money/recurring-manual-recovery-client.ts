import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveManualCycle,
  ManualCycleInput,
  canonicalManualCycle,
} from "@nest/contracts/recurring-manual";
import { ManualCycleSaveResult } from "@nest/contracts/recurring-manual-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(ManualCycleInput);
export function manualCycleRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveManualCycle.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveManualCycle)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalManualCycle(command.input);
      const result = yield* cancel
        ? request("v1/money/recurring/manual/cancel-save", ManualCycleSaveResult, {
            operationId,
          })
        : request(
            `v1/money/recurring/manual/receipt?${new URLSearchParams({ operationId })}`,
            ManualCycleSaveResult,
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
    recoverManualCycle: (input: typeof SaveManualCycle.Type) => status(input, false),
    cancelManualCycleSave: (input: typeof SaveManualCycle.Type) => status(input, true),
  };
}
