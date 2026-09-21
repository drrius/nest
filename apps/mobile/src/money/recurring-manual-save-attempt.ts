import * as Schema from "effect/Schema";
import { SaveManualCycle, canonicalManualCycle } from "@nest/contracts/recurring-manual";
export const ManualCycleSaveAttempt = Schema.Struct({
  command: SaveManualCycle,
  action: Schema.Literals(["save", "cancel"]),
});
export type ManualCycleSaveAttempt = typeof ManualCycleSaveAttempt.Type;
export function manualSaveAttempt(input: typeof SaveManualCycle.Type): ManualCycleSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveManualCycle)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      input: canonicalManualCycle(command.input),
    },
  };
}
