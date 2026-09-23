import * as Effect from "effect/Effect";
import { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { pushEnrollmentOperations } from "./operations.ts";
import type { PushRotationCheckpoint } from "./rotation-checkpoint.ts";
type Dependencies = {
  checkpoint: PushRotationCheckpoint;
  current: () => boolean;
  readInstallation: Effect.Effect<string | null, PreferenceFailure>;
  token: Effect.Effect<string, PreferenceFailure>;
  client: ReturnType<typeof pushDeviceClient>;
  operations: ReturnType<typeof pushEnrollmentOperations>;
  operationId: () => string;
};
// The token adapter must never request permission. Rotation preserves the exact
// enabled revision observed before token acquisition, so a concurrent disable wins.
export function rotatePushDevice(deps: Dependencies) {
  return Effect.gen(function* () {
    const target = yield* rotationTarget(deps);
    if (target === null) return "inactive" as const;
    if (target === "pending") return "pending" as const;
    const { installationId, state } = target;
    const token = yield* deps.token;
    if (!deps.current()) return "inactive" as const;
    const unchanged = yield* deps.checkpoint.matches(installationId, state.revision, token);
    if (!deps.current()) return "inactive" as const;
    if (unchanged) return "unchanged" as const;
    // Keep the earlier revision. Never reread and adopt a newer explicit choice.
    yield* deps.operations.save(
      {
        action: "register",
        operationId: deps.operationId(),
        installationId,
        expectedRevision: state.revision,
        token,
      },
      rotationGuard(deps, installationId, state.revision, token),
    );
    return "rotated" as const;
  });
}

function rotationTarget(deps: Dependencies) {
  return Effect.gen(function* () {
    if (!deps.current()) return null;
    const installationId = yield* deps.readInstallation;
    if (installationId === null || !deps.current()) return null;
    const recovery = yield* deps.operations.recover();
    if (!deps.current()) return null;
    if (recovery?.status === "unresolved") return "pending" as const;
    const state = yield* deps.client.detail(installationId);
    if (!state.enabled || !deps.current()) return null;
    return { installationId, state };
  });
}

function rotationGuard(
  deps: Dependencies,
  installation: string,
  revision: string | null,
  token: string,
) {
  return () =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (!deps.current()) return yield* new PreferenceFailure({ code: "unavailable" });
        if (yield* deps.checkpoint.matches(installation, revision, token))
          return yield* new PreferenceFailure({ code: "conflict" });
      }),
    );
}
