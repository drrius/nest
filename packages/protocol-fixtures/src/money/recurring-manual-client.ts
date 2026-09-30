import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveManualCycle,
  ManualCycleInput,
  ManualCycleReceipt,
  canonicalManualCycle,
} from "@nest/contracts/recurring-manual";
import { manualCycleRecoveryClient } from "./recurring-manual-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(ManualCycleInput);
export type ManualCycleSave = typeof SaveManualCycle.Type;
export function manualCycleClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...manualCycleRecoveryClient(apiUrl, account, credentials),
    saveManualCycle: (input: ManualCycleSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveManualCycle)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalManualCycle(command.input);
        const result = yield* request("v1/money/recurring/manual/save", ManualCycleReceipt, {
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
