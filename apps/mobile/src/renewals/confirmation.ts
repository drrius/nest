import * as Schema from "effect/Schema";
import { SaveRenewal, canonicalRenewalCommand, type RenewalFields } from "@nest/contracts/renewals";
import { renewalDeadline } from "@nest/domain/renewals";
export function renewalReview(fields: RenewalFields) {
  return `${fields.title}\nRenews: ${fields.renewalOn}\nCancellation deadline: ${renewalDeadline(fields.renewalOn, fields.noticeDays)}\nNotice: ${fields.noticeDays} days\n\nThis saves a reminder. It does not cancel a contract or change financial history.`;
}
export function renewalConfirmation(
  input: typeof SaveRenewal.Type,
  current: () => boolean,
  save: (command: typeof SaveRenewal.Type) => Promise<void>,
) {
  const decoded = Schema.decodeUnknownSync(SaveRenewal)(input, { onExcessProperty: "error" });
  const command = canonicalRenewalCommand(decoded) as typeof SaveRenewal.Type;
  let used = false;
  return {
    message: renewalReview(command.fields),
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}
