import * as Effect from "effect/Effect";
import {
  SaveRenewal,
  RemoveRenewal,
  RenewalCommand,
  RenewalReceipt,
  RenewalRecovery,
  canonicalRenewalCommand,
  sameRenewalCommand,
} from "@nest/contracts/renewals";
import { type RenewalRequests, validateRenewal, unavailableRenewal } from "./requests.ts";
export function renewalWriteClient(request: RenewalRequests) {
  const send = (input: RenewalCommand, remove: boolean) =>
    Effect.gen(function* () {
      const command = canonicalRenewalCommand(
        yield* validateRenewal<RenewalCommand>(remove ? RemoveRenewal : SaveRenewal, input),
      );
      const result = yield* request(
        remove ? "v1/renewals/remove" : "v1/renewals/save",
        RenewalReceipt,
        command,
      );
      if (!sameRenewalCommand(result.command, command)) return yield* unavailableRenewal();
      return result;
    });
  const recover = (input: RenewalCommand, cancel: boolean) =>
    Effect.gen(function* () {
      const command = canonicalRenewalCommand(yield* validateRenewal(RenewalCommand, input));
      const operationId = command.operationId;
      const result = yield* request(
        cancel
          ? "v1/renewals/cancel-operation"
          : `v1/renewals/operation?${new URLSearchParams({ operationId })}`,
        RenewalRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameRenewalCommand(result.receipt.command, command))
      )
        return yield* unavailableRenewal();
      return result;
    });
  return {
    save: (input: typeof SaveRenewal.Type) => send(input, false),
    remove: (input: typeof RemoveRenewal.Type) => send(input, true),
    recover: (input: RenewalCommand) => recover(input, false),
    cancel: (input: RenewalCommand) => recover(input, true),
  };
}
