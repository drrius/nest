import * as Schema from "effect/Schema";
import { SaveRecurringState } from "@nest/contracts/recurring-state";
import { canonicalRecurringState } from "@nest/contracts/recurring-state";
export const RecurringStateSaveAttempt = Schema.Struct({
  command: SaveRecurringState,
  action: Schema.Literals(["save", "cancel"]),
});
export type RecurringStateSaveAttempt = typeof RecurringStateSaveAttempt.Type;
export function stateSaveAttempt(input: typeof SaveRecurringState.Type): RecurringStateSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveRecurringState)(input, {
    onExcessProperty: "error",
  });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      change: canonicalRecurringState(command.change),
    },
  };
}
