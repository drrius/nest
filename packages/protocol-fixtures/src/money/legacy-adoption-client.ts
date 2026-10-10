import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyAdoption,
  ExecuteLegacyAdoption,
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
export type LegacyAdoptionExecute = typeof ExecuteLegacyAdoption.Type;
export function legacyAdoptionClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const send = (input: LegacyAdoptionSave | LegacyAdoptionExecute, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(
        approved ? ExecuteLegacyAdoption : SaveLegacyAdoption,
      )(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const approvalId = Schema.is(ExecuteLegacyAdoption)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase(),
        change = canonicalLegacyAdoption(command.input);
      const result = yield* request(
        approved
          ? "v1/money/recurring/legacy-adoption/execute"
          : "v1/money/recurring/legacy-adoption/save",
        LegacyAdoptionReceipt,
        {
          operationId,
          input: change,
          ...(approved ? { approvalId } : {}),
        },
      );
      if (
        result.actorId !== account.actor ||
        result.householdId !== account.household ||
        result.operationId !== operationId ||
        result.approvalId !== approvalId ||
        !equivalent(result.input, change)
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return result;
    });
  return {
    ...legacyAdoptionRecoveryClient(apiUrl, account, credentials),
    saveLegacyAdoption: (input: LegacyAdoptionSave) => send(input, false),
    executeLegacyAdoption: (input: LegacyAdoptionExecute) => send(input, true),
  };
}
