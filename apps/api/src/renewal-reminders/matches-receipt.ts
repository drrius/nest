import * as Schema from "effect/Schema";
import {
  SaveRenewalReminderInput,
  RenewalReminderReceipt,
  canonicalRenewalReminder,
  sameRenewalReminderCommand,
} from "@nest/contracts/reminders";
export function matchesRenewalReminderReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (action !== "saveRenewalReminder") return null;
  if (!Schema.is(SaveRenewalReminderInput)(input) || !Schema.is(RenewalReminderReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    sameRenewalReminderCommand(
      canonicalRenewalReminder({ ...input, operationId: receipt.operationId }),
      receipt.command,
    )
  );
}
