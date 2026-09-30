import * as Schema from "effect/Schema";
import { SaveRecurringState } from "@nest/contracts/recurring-state";
import { canonicalRecurringState } from "@nest/contracts/recurring-state";
import { SaveRecurringResume, canonicalRecurringResume } from "@nest/contracts/recurring-resume";
import type { RecurringStateSaveResult } from "@nest/contracts/recurring-state-read";
import type { RecurringResumeSaveResult } from "@nest/contracts/recurring-resume-read";
export const StateSaveCommand = Schema.Union([SaveRecurringState, SaveRecurringResume]);
export type StateSaveCommand = typeof StateSaveCommand.Type;
export type StateSaveResult = RecurringStateSaveResult | RecurringResumeSaveResult;
export const RecurringStateSaveAttempt = Schema.Struct({
  command: StateSaveCommand,
  action: Schema.Literals(["save", "cancel"]),
});
export type RecurringStateSaveAttempt = typeof RecurringStateSaveAttempt.Type;
export function stateSaveAttempt(input: StateSaveCommand): RecurringStateSaveAttempt {
  const command = Schema.decodeUnknownSync(StateSaveCommand)(input, {
    onExcessProperty: "error",
  });
  return {
    action: "save",
    command: Schema.is(SaveRecurringResume)(command)
      ? {
          operationId: command.operationId.toLowerCase(),
          change: canonicalRecurringResume(command.change),
        }
      : {
          operationId: command.operationId.toLowerCase(),
          change: canonicalRecurringState(command.change),
        },
  };
}
