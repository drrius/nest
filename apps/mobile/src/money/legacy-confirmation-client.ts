import { legacyConfirmationApprovalClient } from "./legacy-confirmation-approval-client.ts";
import { legacyConfirmationContextClient } from "./legacy-confirmation-context-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyConfirmation,
  LegacyConfirmInput,
  LegacyConfirmationReceipt,
  canonicalLegacyConfirmation,
} from "@nest/contracts/legacy-draft-confirmation";
import { legacyConfirmationRecoveryClient } from "./legacy-confirmation-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(LegacyConfirmInput);
export type LegacyConfirmationSave = typeof SaveLegacyConfirmation.Type;
export function legacyConfirmationClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...legacyConfirmationApprovalClient(apiUrl, account, credentials),
    ...legacyConfirmationContextClient(apiUrl, account, credentials),
    ...legacyConfirmationRecoveryClient(apiUrl, account, credentials),
    saveLegacyConfirmation: (input: LegacyConfirmationSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveLegacyConfirmation)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalLegacyConfirmation(command.input);
        const result = yield* request(
          "v1/money/recurring/legacy-confirmation/save",
          LegacyConfirmationReceipt,
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
