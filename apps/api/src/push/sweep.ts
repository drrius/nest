import { PushScanCursorSchema, cursorAdvances, type PushScanCursor } from "./scan-cursor.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import type { pushWorkerRpc } from "./worker-rpc.ts";
import type { pushDeliveryWorker } from "./delivery-worker.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Count = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 100 }));
const Page = Schema.Struct({
  version: Schema.Literal(1),
  scanned: Count,
  deliveries: Schema.Array(Uuid).check(Schema.isMaxLength(100)),
  after: Schema.NullOr(PushScanCursorSchema),
  complete: Schema.Boolean,
});
export { PushScanCursorSchema } from "./scan-cursor.ts";
export type { PushScanCursor } from "./scan-cursor.ts";
type Worker = ReturnType<typeof pushDeliveryWorker>;
type Rpc = ReturnType<typeof pushWorkerRpc>;
function validatePage(page: typeof Page.Type) {
  const consistent =
    page.deliveries.length <= page.scanned &&
    new Set(page.deliveries).size === page.deliveries.length &&
    (page.complete
      ? page.after === null && page.scanned < 100
      : page.after !== null && page.scanned === 100);
  return consistent ? Effect.succeed(page) : Effect.fail(new ApiFailure({ code: "unavailable" }));
}
/** One page per invocation. The caller durably checkpoints the returned cursor. */
export function runPushPage(rpc: Rpc, worker: Worker, after: PushScanCursor | null) {
  return Effect.gen(function* () {
    yield* Schema.decodeUnknownEffect(Schema.NullOr(PushScanCursorSchema))(after);
    const raw = yield* rpc(
      "scan",
      after === null
        ? {}
        : {
            p_due: after.dueAt,
            p_outbox: after.outboxId,
            p_installation: after.installationId,
          },
    );
    const page = yield* Schema.decodeUnknownEffect(Page)(raw).pipe(Effect.flatMap(validatePage));
    if (page.after !== null && after !== null && !cursorAdvances(page.after, after))
      return yield* new ApiFailure({ code: "unavailable" });
    const outcomes = yield* Effect.forEach(
      page.deliveries,
      (deliveryId) =>
        worker.send(deliveryId).pipe(
          Effect.map((status) => ({ deliveryId, status })),
          Effect.catch(() => Effect.succeed({ deliveryId, status: "failed" as const })),
        ),
      { concurrency: 4 },
    );
    return { scanned: page.scanned, after: page.after, complete: page.complete, outcomes };
  }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
}
