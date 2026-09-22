import * as Schema from "effect/Schema";
import {
  SaveLegacyConfirmation,
  canonicalLegacyConfirmation,
} from "@nest/contracts/legacy-draft-confirmation";
export const LegacyConfirmationSaveAttempt = Schema.Struct({
  command: SaveLegacyConfirmation,
  action: Schema.Literals(["save", "cancel"]),
});
export type LegacyConfirmationSaveAttempt = typeof LegacyConfirmationSaveAttempt.Type;
export function legacyConfirmationAttempt(
  input: typeof SaveLegacyConfirmation.Type,
): LegacyConfirmationSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveLegacyConfirmation)(input, {
    onExcessProperty: "error",
  });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      input: canonicalLegacyConfirmation(command.input),
    },
  };
}
