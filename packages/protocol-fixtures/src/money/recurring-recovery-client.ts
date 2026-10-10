import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveRecurring, RecurringInput, canonicalRecurring } from "@nest/contracts/recurring";
import { RecurringSaveResult } from "@nest/contracts/recurring-save-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(RecurringInput);
export function recurringRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveRecurring.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveRecurring)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        rule = canonicalRecurring(command.rule);
      const result = yield* cancel
        ? request("v1/money/recurring/cancel-save", RecurringSaveResult, { operationId })
        : request(
            `v1/money/recurring/receipt?${new URLSearchParams({ operationId })}`,
            RecurringSaveResult,
          );
      if (
        result.actorId !== account.actor ||
        result.householdId !== account.household ||
        result.operationId !== operationId ||
        (result.receipt !== null && !equivalent(result.receipt.rule, rule)) ||
        (cancel && result.status === "unresolved")
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
  return {
    recoverRecurring: (input: typeof SaveRecurring.Type) => status(input, false),
    cancelRecurringSave: (input: typeof SaveRecurring.Type) => status(input, true),
  };
}
