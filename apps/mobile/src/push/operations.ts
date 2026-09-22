import * as Effect from "effect/Effect";
import type { PushDeviceCommand } from "@nest/contracts/push-registration";
import type { Account } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { protectedPushAttempts } from "./protected-attempt.ts";
type Dependencies = {
  account: Account;
  client: ReturnType<typeof pushDeviceClient>;
  store: ReturnType<typeof protectedPushAttempts>;
  current: () => boolean;
};
export function pushEnrollmentOperations(deps: Dependencies) {
  const check = () =>
    Effect.suspend(() =>
      deps.current() ? Effect.void : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
    );
  const disk = <T>(body: () => Promise<T>) =>
    Effect.tryPromise({
      try: body,
      catch: () => new PreferenceFailure({ code: "unavailable" }),
    });
  const finish = (command: PushDeviceCommand) =>
    Effect.gen(function* () {
      yield* check();
      yield* disk(() => deps.store.clear(deps.account, command));
      yield* check();
    });
  const operations = {
    save: (command: PushDeviceCommand) =>
      Effect.gen(function* () {
        yield* check();
        const staged = yield* disk(() => deps.store.stage(deps.account, command));
        yield* check();
        const receipt = yield* deps.client.save(staged);
        yield* check();
        yield* finish(staged);
        return receipt;
      }),
    recover: () =>
      Effect.gen(function* () {
        yield* check();
        const command = yield* disk(() => deps.store.read(deps.account));
        yield* check();
        if (command === null) return null;
        const recovery = yield* deps.client.recover(command);
        yield* check();
        if (recovery.status === "recorded") yield* finish(command);
        return recovery;
      }),
  };
  return {
    ...operations,
    retryPending: () =>
      Effect.gen(function* () {
        yield* check();
        const command = yield* disk(() => deps.store.read(deps.account));
        yield* check();
        if (command === null) return null;
        const recovery = yield* deps.client.recover(command);
        yield* check();
        if (recovery.status === "recorded") {
          yield* finish(command);
          return recovery.receipt;
        }
        // Only an explicit Retry action reaches this path; reuse the protected
        // command, never request a new token or invent another operation identity.
        return yield* operations.save(command);
      }),
  };
}
