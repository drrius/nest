import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurringResume,
  RecurringResumeInput,
  canonicalRecurringResume,
} from "@nest/contracts/recurring-resume";
import { RecurringResumeSaveResult } from "@nest/contracts/recurring-resume-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(RecurringResumeInput);
export function recurringResumeRecoveryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: typeof SaveRecurringResume.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(SaveRecurringResume)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const operationId = command.operationId.toLowerCase(),
        change = canonicalRecurringResume(command.change);
      const result = yield* cancel
        ? request("v1/money/recurring/resume/cancel-save", RecurringResumeSaveResult, {
            operationId,
          })
        : request(
            `v1/money/recurring/resume/receipt?${new URLSearchParams({ operationId })}`,
            RecurringResumeSaveResult,
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
    recoverRecurringResume: (input: typeof SaveRecurringResume.Type) => status(input, false),
    cancelRecurringResumeSave: (input: typeof SaveRecurringResume.Type) => status(input, true),
  };
}
