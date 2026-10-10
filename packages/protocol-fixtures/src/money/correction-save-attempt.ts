import * as Schema from "effect/Schema";
import { SaveCorrection } from "@nest/contracts/correction";
import { canonicalCorrection } from "@nest/contracts/correction";
export const CorrectionSaveAttempt = Schema.Struct({
  command: SaveCorrection,
  action: Schema.Literals(["save", "cancel"]),
});
export type CorrectionSaveAttempt = typeof CorrectionSaveAttempt.Type;
export function saveAttempt(input: typeof SaveCorrection.Type): CorrectionSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveCorrection)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      correction: canonicalCorrection(command.correction),
    },
  };
}
