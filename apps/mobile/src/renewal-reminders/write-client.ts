import * as Effect from "effect/Effect";
import {
  SaveRenewalReminder,
  RenewalReminderReceipt,
  RenewalReminderRecovery,
  canonicalRenewalReminder,
  sameRenewalReminderCommand,
} from "@nest/contracts/reminders";
import { type RenewalRequests, validateRenewal, unavailableRenewal } from "../renewals/requests.ts";
export function renewalReminderWriteClient(request: RenewalRequests) {
  const send = (input: typeof SaveRenewalReminder.Type) =>
    Effect.gen(function* () {
      const command = canonicalRenewalReminder(yield* validateRenewal(SaveRenewalReminder, input));
      const result = yield* request("v1/renewal-reminders/save", RenewalReminderReceipt, command);
      if (!sameRenewalReminderCommand(result.command, command)) return yield* unavailableRenewal();
      return result;
    });
  const recover = (input: typeof SaveRenewalReminder.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const command = canonicalRenewalReminder(yield* validateRenewal(SaveRenewalReminder, input));
      const operationId = command.operationId;
      const result = yield* request(
        cancel
          ? "v1/renewal-reminders/cancel-operation"
          : `v1/renewal-reminders/operation?${new URLSearchParams({ operationId })}`,
        RenewalReminderRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameRenewalReminderCommand(result.receipt.command, command))
      )
        return yield* unavailableRenewal();
      return result;
    });
  return {
    save: (input: typeof SaveRenewalReminder.Type) => send(input),
    recover: (input: typeof SaveRenewalReminder.Type) => recover(input, false),
    cancel: (input: typeof SaveRenewalReminder.Type) => recover(input, true),
  };
}
