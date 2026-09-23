import * as Effect from "effect/Effect";
import type { PushDeviceCommand, PushDeviceReceipt } from "@nest/contracts/push-registration";
import type { Account } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { protectedPushAttempts } from "./protected-attempt.ts";
type Dependencies = {
  account: Account;
  client: ReturnType<typeof pushDeviceClient>;
  store: ReturnType<typeof protectedPushAttempts>;
  current: () => boolean;
  onRecorded: (
    receipt: typeof PushDeviceReceipt.Type,
    token: string,
  ) => Effect.Effect<void, PreferenceFailure>;
  onCancelled: (command: PushDeviceCommand) => Effect.Effect<void, PreferenceFailure>;
};
export function pushEnrollmentOperations(deps: Dependencies) {
  const check = () => currentEffect(deps.current);
  const finish = (
    command: PushDeviceCommand,
    cancelled = false,
    receipt?: typeof PushDeviceReceipt.Type | null,
  ) =>
    Effect.gen(function* () {
      yield* check();
      if (cancelled) yield* deps.onCancelled(command);
      if (receipt && command.action === "register") yield* deps.onRecorded(receipt, command.token);
      yield* check();
      yield* protectedEffect(() => deps.store.clear(deps.account, command));
      yield* check();
    });
  const operations = {
    save: (command: PushDeviceCommand, beforeStage?: () => Promise<void>) =>
      Effect.gen(function* () {
        yield* check();
        const staged = yield* protectedEffect(() =>
          deps.store.stage(deps.account, command, beforeStage),
        );
        yield* check();
        const receipt = yield* deps.client.save(staged);
        yield* check();
        yield* finish(staged, false, receipt);
        return receipt;
      }),
    recover: () =>
      Effect.gen(function* () {
        yield* check();
        const command = yield* protectedEffect(() => deps.store.read(deps.account));
        yield* check();
        if (command === null) return null;
        const recovery = yield* deps.client.recover(command);
        yield* check();
        if (recovery.status !== "unresolved")
          yield* finish(command, recovery.status === "cancelled", recovery.receipt);
        return recovery;
      }),
  };
  return {
    ...operations,
    cancelPending: () =>
      Effect.gen(function* () {
        yield* check();
        const command = yield* protectedEffect(() => deps.store.read(deps.account));
        yield* check();
        if (command === null) return null;
        yield* protectedEffect(() => deps.store.requestCancellation(deps.account, command));
        yield* check();
        const result = yield* deps.client.cancel(command);
        yield* finish(command, result.status === "cancelled", result.receipt);
        return result;
      }),
    retryPending: () =>
      Effect.gen(function* () {
        yield* check();
        const command = yield* protectedEffect(() => deps.store.read(deps.account));
        yield* check();
        if (command === null) return null;
        const recovery = yield* deps.client.recover(command);
        yield* check();
        if (recovery.status !== "unresolved") {
          yield* finish(command, recovery.status === "cancelled", recovery.receipt);
          return recovery.receipt;
        }
        const cancelling = yield* protectedEffect(() => deps.store.cancelling(deps.account));
        yield* check();
        if (cancelling) {
          const result = yield* deps.client.cancel(command);
          yield* finish(command, result.status === "cancelled", result.receipt);
          return result.receipt;
        }
        // Only an explicit Retry action reaches this path; reuse the protected
        // command, never request a new token or invent another operation identity.
        return yield* operations.save(command);
      }),
  };
}

const protectedEffect = <T>(body: () => Promise<T>) =>
  Effect.tryPromise({
    try: body,
    catch: () => new PreferenceFailure({ code: "unavailable" }),
  });

function currentEffect(current: () => boolean) {
  return Effect.suspend(() =>
    current() ? Effect.void : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
  );
}
