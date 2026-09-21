import * as Schema from "effect/Schema";
import { SaveSettlement } from "@nest/contracts/settlement";
import { canonicalSettlement } from "@nest/contracts/settlement";
export const SettlementSaveAttempt = Schema.Struct({
  command: SaveSettlement,
  action: Schema.Literals(["save", "cancel"]),
});
export type SettlementSaveAttempt = typeof SettlementSaveAttempt.Type;
export function saveAttempt(input: typeof SaveSettlement.Type): SettlementSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveSettlement)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      settlement: canonicalSettlement(command.settlement),
    },
  };
}
