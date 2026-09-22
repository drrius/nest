import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyAdoption,
  LegacyAdoptionInput,
  LegacyAdoptionReceipt,
  canonicalLegacyAdoption,
} from "@nest/contracts/legacy-adoption-command";
import { legacyAdoptionRecoveryClient } from "./legacy-adoption-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyAdoptionInput);
export type LegacyAdoptionSave = typeof SaveLegacyAdoption.Type;
export function legacyAdoptionClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...legacyAdoptionRecoveryClient(apiUrl, account, credentials),
    saveLegacyAdoption: (input: LegacyAdoptionSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveLegacyAdoption)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalLegacyAdoption(command.input);
        const result = yield* request(
          "v1/money/recurring/legacy-adoption/save",
          LegacyAdoptionReceipt,
          {
            operationId,
            input: change,
          },
        );
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
