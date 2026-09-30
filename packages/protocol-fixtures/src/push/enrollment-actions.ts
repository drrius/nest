import * as Effect from "effect/Effect";
import { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { pushEnrollmentOperations } from "./operations.ts";
type Dependencies = {
  current: () => boolean;
  installation: Effect.Effect<string, PreferenceFailure>;
  token: Effect.Effect<string, PreferenceFailure>;
  operationId: () => string;
  client: ReturnType<typeof pushDeviceClient>;
  operations: ReturnType<typeof pushEnrollmentOperations>;
};
// Invoke enable/disable from explicit user actions only. Constructing this object
// performs no permission request, token acquisition or server mutation.
export function pushEnrollmentActions(deps: Dependencies) {
  const check = () =>
    Effect.suspend(() =>
      deps.current() ? Effect.void : Effect.fail(new PreferenceFailure({ code: "session" })),
    );
  const prepare = () =>
    Effect.gen(function* () {
      yield* check();
      const recovered = yield* deps.operations.recover();
      yield* check();
      if (recovered?.status === "unresolved")
        return yield* new PreferenceFailure({ code: "conflict" });
      const installationId = yield* deps.installation;
      yield* check();
      return installationId;
    });
  return {
    enable: () =>
      Effect.gen(function* () {
        const installationId = yield* prepare();
        const token = yield* deps.token;
        yield* check();
        const state = yield* deps.client.detail(installationId);
        yield* check();
        return yield* deps.operations.save({
          action: "register",
          operationId: deps.operationId(),
          installationId,
          expectedRevision: state.revision,
          token,
        });
      }),
    disable: () =>
      Effect.gen(function* () {
        const installationId = yield* prepare();
        const state = yield* deps.client.detail(installationId);
        yield* check();
        return yield* deps.operations.save({
          action: "disable",
          operationId: deps.operationId(),
          installationId,
          expectedRevision: state.revision,
        });
      }),
  };
}
