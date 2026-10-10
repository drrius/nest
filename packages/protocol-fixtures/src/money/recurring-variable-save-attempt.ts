import * as Schema from "effect/Schema";
import { SaveVariableCycle, canonicalVariableCycle } from "@nest/contracts/recurring-variable";
export const VariableCycleSaveAttempt = Schema.Struct({
  command: SaveVariableCycle,
  action: Schema.Literals(["save", "cancel"]),
});
export type VariableCycleSaveAttempt = typeof VariableCycleSaveAttempt.Type;
export function variableSaveAttempt(
  input: typeof SaveVariableCycle.Type,
): VariableCycleSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveVariableCycle)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      input: canonicalVariableCycle(command.input),
    },
  };
}
