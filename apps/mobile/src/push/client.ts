import * as Effect from "effect/Effect";
import {
  PushDeviceCommand,
  PushDeviceReceipt,
  PushDeviceRecovery,
  PushDeviceQuery,
  PushDeviceState,
  canonicalPushDevice,
  pushDeviceDigestInput,
  matchesPushDeviceReceipt,
} from "@nest/contracts/push-registration";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import type { PreferenceFailure } from "../preferences/client.ts";
import { renewalRequests, validateRenewal, unavailableRenewal } from "../renewals/requests.ts";
export function pushDeviceClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  hash: (input: string) => Effect.Effect<string, PreferenceFailure>,
) {
  const request = renewalRequests(apiUrl, account, credentials);
  const prepare = (input: PushDeviceCommand) =>
    Effect.gen(function* () {
      const command = canonicalPushDevice(yield* validateRenewal(PushDeviceCommand, input));
      const commandDigest = yield* hash(
        pushDeviceDigestInput(command, account.actor, account.household),
      );
      return {
        command,
        expected: { actorId: account.actor, householdId: account.household, commandDigest },
      };
    });
  return {
    save: (input: PushDeviceCommand) =>
      Effect.gen(function* () {
        const { command, expected } = yield* prepare(input);
        const receipt = yield* request("v1/push-devices/save", PushDeviceReceipt, command);
        if (!matchesPushDeviceReceipt(receipt, command, expected))
          return yield* unavailableRenewal();
        return receipt;
      }),
    recover: (input: PushDeviceCommand) =>
      Effect.gen(function* () {
        const { command, expected } = yield* prepare(input);
        const result = yield* request(
          `v1/push-devices/operation?${new URLSearchParams({ operationId: command.operationId })}`,
          PushDeviceRecovery,
        );
        if (
          result.operationId !== command.operationId ||
          (result.receipt !== null && !matchesPushDeviceReceipt(result.receipt, command, expected))
        )
          return yield* unavailableRenewal();
        return result;
      }),
    detail: (installationId: string) =>
      Effect.gen(function* () {
        const query = yield* validateRenewal(PushDeviceQuery, { installationId });
        const target = query.installationId.toLowerCase();
        const result = yield* request(
          `v1/push-devices/detail?${new URLSearchParams({ installationId: target })}`,
          PushDeviceState,
        );
        if (result.installationId !== target) return yield* unavailableRenewal();
        return result;
      }),
  };
}
