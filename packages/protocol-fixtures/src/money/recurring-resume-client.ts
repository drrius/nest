import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurringResume,
  RecurringResumeInput,
  RecurringResumeReceipt,
  canonicalRecurringResume,
} from "@nest/contracts/recurring-resume";
import { recurringResumeRecoveryClient } from "./recurring-resume-recovery-client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(RecurringResumeInput);
export type RecurringResumeSave = typeof SaveRecurringResume.Type;
export function recurringResumeClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...recurringResumeRecoveryClient(apiUrl, account, credentials),
    saveRecurringResume: (input: RecurringResumeSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveRecurringResume)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          change = canonicalRecurringResume(command.change);
        const result = yield* request("v1/money/recurring/resume/save", RecurringResumeReceipt, {
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
