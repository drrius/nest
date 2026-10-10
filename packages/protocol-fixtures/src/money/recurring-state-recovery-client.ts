import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurringState,
  RecurringStateInput,
  canonicalRecurringState,
} from "@nest/contracts/recurring-state";
import { RecurringStateSaveResult } from "@nest/contracts/recurring-state-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(RecurringStateInput);
export function recurringStateRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveRecurringState.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveRecurringState)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalRecurringState(command.change);
      const result = yield* cancel
        ? request("v1/money/recurring/state/cancel-save", RecurringStateSaveResult, { operationId })
        : request(
            `v1/money/recurring/state/receipt?${new URLSearchParams({ operationId })}`,
            RecurringStateSaveResult,
          );
      if (
        result.actorId !== account.actor ||
        result.householdId !== account.household ||
        result.operationId !== operationId ||
        (result.receipt !== null && !equivalent(result.receipt.change, change)) ||
        (cancel && result.status === "unresolved")
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
  return {
    recoverRecurringState: (input: typeof SaveRecurringState.Type) => status(input, false),
    cancelRecurringStateSave: (input: typeof SaveRecurringState.Type) => status(input, true),
  };
}
