import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import { PushScanCursorSchema, runPushPage } from "./sweep.ts";
import type { pushWorkerRpc } from "./worker-rpc.ts";
import type { pushDeliveryWorker } from "./delivery-worker.ts";
const Checkpoint = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.String.check(Schema.isUUID()),
  after: Schema.NullOr(PushScanCursorSchema),
});
/** Save progress only after all page attempts settle. Lost saves recover by rereading. */
export function runCheckpointedPushPage(
  rpc: ReturnType<typeof pushWorkerRpc>,
  worker: ReturnType<typeof pushDeliveryWorker>,
) {
  return Effect.gen(function* () {
    const start = yield* Schema.decodeUnknownEffect(Checkpoint)(yield* rpc("readCheckpoint", {}));
    const report = yield* runPushPage(rpc, worker, start.after);
    const saved = yield* Schema.decodeUnknownEffect(Checkpoint)(
      yield* rpc("saveCheckpoint", {
        p_revision: start.revision,
        p_after: report.after,
      }),
    );
    if (
      saved.revision === start.revision ||
      saved.after?.dueAt !== report.after?.dueAt ||
      saved.after?.outboxId !== report.after?.outboxId ||
      saved.after?.installationId !== report.after?.installationId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return { ...report, checkpointRevision: saved.revision };
  }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
}
