import * as Schema from "effect/Schema";
import { SaveRefund } from "@nest/contracts/refund";
import { canonicalRefund } from "@nest/contracts/refund";
export const RefundSaveAttempt = Schema.Struct({
  command: SaveRefund,
  action: Schema.Literals(["save", "cancel"]),
});
export type RefundSaveAttempt = typeof RefundSaveAttempt.Type;
export function saveAttempt(input: typeof SaveRefund.Type): RefundSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveRefund)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      refund: canonicalRefund(command.refund),
    },
  };
}
