import * as Schema from "effect/Schema";
import { RenewalCommand, canonicalRenewalCommand } from "@nest/contracts/renewals";
export const RenewalSaveAttempt = Schema.Struct({
  command: RenewalCommand,
  action: Schema.Literals(["save", "cancel"]),
});
export type RenewalSaveAttempt = typeof RenewalSaveAttempt.Type;
export function renewalAttempt(input: RenewalCommand): RenewalSaveAttempt {
  const command = Schema.decodeUnknownSync(RenewalCommand)(input, { onExcessProperty: "error" });
  return { action: "save", command: canonicalRenewalCommand(command) };
}
