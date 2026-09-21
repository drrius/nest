import * as Schema from "effect/Schema";
import { SaveRecurring } from "@nest/contracts/recurring";
import { canonicalRecurring } from "@nest/contracts/recurring";
export const RecurringSaveAttempt = Schema.Struct({
  command: SaveRecurring,
  action: Schema.Literals(["save", "cancel"]),
});
export type RecurringSaveAttempt = typeof RecurringSaveAttempt.Type;
export function saveAttempt(input: typeof SaveRecurring.Type): RecurringSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveRecurring)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      rule: canonicalRecurring(command.rule),
    },
  };
}
