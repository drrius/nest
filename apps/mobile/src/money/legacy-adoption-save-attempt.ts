import * as Schema from "effect/Schema";
import {
  SaveLegacyAdoption,
  canonicalLegacyAdoption,
} from "@nest/contracts/legacy-adoption-command";
export const LegacyAdoptionSaveAttempt = Schema.Struct({
  command: SaveLegacyAdoption,
  action: Schema.Literals(["save", "cancel"]),
});
export type LegacyAdoptionSaveAttempt = typeof LegacyAdoptionSaveAttempt.Type;
export function legacyAdoptionAttempt(
  input: typeof SaveLegacyAdoption.Type,
): LegacyAdoptionSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveLegacyAdoption)(input, {
    onExcessProperty: "error",
  });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      input: canonicalLegacyAdoption(command.input),
    },
  };
}
