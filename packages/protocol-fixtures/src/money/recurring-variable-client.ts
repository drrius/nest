import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveVariableCycle,
  VariableCycleInput,
  VariableCycleReceipt,
  canonicalVariableCycle,
} from "@nest/contracts/recurring-variable";
import { variableCycleRecoveryClient } from "./recurring-variable-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(VariableCycleInput);
export type VariableCycleSave = typeof SaveVariableCycle.Type;
export function variableCycleClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...variableCycleRecoveryClient(apiUrl, account, credentials),
    saveVariableCycle: (input: VariableCycleSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveVariableCycle)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalVariableCycle(command.input);
        const result = yield* request("v1/money/recurring/variable/save", VariableCycleReceipt, {
          operationId,
          input: change,
        });
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
