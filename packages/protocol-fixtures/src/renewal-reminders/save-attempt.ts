import * as Schema from "effect/Schema";
import { SaveRenewalReminder, canonicalRenewalReminder } from "@nest/contracts/reminders";
export const RenewalReminderSaveAttempt = Schema.Struct({
  command: SaveRenewalReminder,
  action: Schema.Literals(["save", "cancel"]),
});
export type RenewalReminderSaveAttempt = typeof RenewalReminderSaveAttempt.Type;
export function renewalReminderAttempt(
  input: typeof SaveRenewalReminder.Type,
): RenewalReminderSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveRenewalReminder)(input, {
    onExcessProperty: "error",
  });
  return { action: "save", command: canonicalRenewalReminder(command) };
}
