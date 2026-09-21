import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurringState,
  RecurringStateInput,
  RecurringStateReceipt,
  canonicalRecurringState,
} from "@nest/contracts/recurring-state";
import { recurringStateRecoveryClient } from "./recurring-state-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(RecurringStateInput);
export type RecurringStateSave = typeof SaveRecurringState.Type;
export function recurringStateClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...recurringStateRecoveryClient(apiUrl, account, credentials),
    saveRecurringState: (input: RecurringStateSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveRecurringState)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalRecurringState(command.change);
        const result = yield* request("v1/money/recurring/state/save", RecurringStateReceipt, {
          operationId,
          change,
        });
        if (
          result.actorId !== account.actor ||
          result.householdId !== account.household ||
          result.operationId !== operationId ||
          result.approvalId !== null ||
          !equivalent(result.change, change)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
