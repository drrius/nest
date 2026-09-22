import * as Schema from "effect/Schema";
import {
  SaveLegacyDismissal,
  canonicalLegacyDismissal,
} from "@nest/contracts/legacy-draft-dismissal";
export const LegacyDismissalSaveAttempt = Schema.Struct({
  command: SaveLegacyDismissal,
  action: Schema.Literals(["save", "cancel"]),
});
export type LegacyDismissalSaveAttempt = typeof LegacyDismissalSaveAttempt.Type;
export function legacyDismissalAttempt(
  input: typeof SaveLegacyDismissal.Type,
): LegacyDismissalSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveLegacyDismissal)(input, {
    onExcessProperty: "error",
  });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      input: canonicalLegacyDismissal(command.input),
    },
  };
}
