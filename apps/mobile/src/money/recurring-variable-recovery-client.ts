import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveVariableCycle,
  VariableCycleInput,
  canonicalVariableCycle,
} from "@nest/contracts/recurring-variable";
import { VariableCycleSaveResult } from "@nest/contracts/recurring-variable-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(VariableCycleInput);
export function variableCycleRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveVariableCycle.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveVariableCycle)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalVariableCycle(command.input);
      const result = yield* cancel
        ? request("v1/money/recurring/variable/cancel-save", VariableCycleSaveResult, {
            operationId,
          })
        : request(
            `v1/money/recurring/variable/receipt?${new URLSearchParams({ operationId })}`,
            VariableCycleSaveResult,
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
    recoverVariableCycle: (input: typeof SaveVariableCycle.Type) => status(input, false),
    cancelVariableCycleSave: (input: typeof SaveVariableCycle.Type) => status(input, true),
  };
}
