import * as Effect from "effect/Effect";
import type { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { pushEnrollmentOperations } from "./operations.ts";
type Dependencies = {
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
    if (!deps.current()) return "inactive" as const;
    const installationId = yield* deps.readInstallation;
    if (installationId === null || !deps.current()) return "inactive" as const;
    const recovery = yield* deps.operations.recover();
    if (!deps.current()) return "inactive" as const;
    if (recovery?.status === "unresolved") return "pending" as const;
    const state = yield* deps.client.detail(installationId);
    if (!state.enabled || !deps.current()) return "inactive" as const;
    const token = yield* deps.token;
    if (!deps.current()) return "inactive" as const;
    // Keep the earlier revision. Never reread and adopt a newer explicit choice.
    yield* deps.operations.save({
      action: "register",
      operationId: deps.operationId(),
      installationId,
      expectedRevision: state.revision,
      token,
    });
    return "rotated" as const;
  });
}
