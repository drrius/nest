import * as Schema from "effect/Schema";
import { SaveRenewal, canonicalRenewalCommand, type RenewalFields } from "@nest/contracts/renewals";
import { renewalDeadline } from "@nest/domain/renewals";
export interface RenewalReviewLabels {
  responsible: string;
  linked: string;
}
export function renewalReview(fields: RenewalFields, labels: RenewalReviewLabels) {
  return `${fields.title}\nRenews: ${fields.renewalOn}\nCancellation deadline: ${renewalDeadline(fields.renewalOn, fields.noticeDays)}\nNotice: ${fields.noticeDays} days\nResponsible: ${labels.responsible}\nLinked expense: ${labels.linked}\n\nThis saves a reminder. It does not cancel a contract or change financial history.`;
}
export function renewalConfirmation(
  input: typeof SaveRenewal.Type,
  current: () => boolean,
  save: (command: typeof SaveRenewal.Type) => Promise<void>,
  labels: RenewalReviewLabels,
) {
  const decoded = Schema.decodeUnknownSync(SaveRenewal)(input, { onExcessProperty: "error" });
  const command = canonicalRenewalCommand(decoded) as typeof SaveRenewal.Type;
  let used = false;
  return {
    message: renewalReview(command.fields, labels),
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}
