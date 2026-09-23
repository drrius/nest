import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import { ReceiptClaim, type pushDeliveryWorker } from "./delivery-worker.ts";
import type { pushWorkerRpc } from "./worker-rpc.ts";
const Claims = Schema.Struct({
  scanned: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  claims: Schema.Array(ReceiptClaim).check(Schema.isMaxLength(100)),
});
/** Poll claims are already durably delayed by the database, including on crash. */
export function runPushReceipts(
  rpc: ReturnType<typeof pushWorkerRpc>,
  worker: ReturnType<typeof pushDeliveryWorker>,
) {
  return Effect.gen(function* () {
    const page = yield* Schema.decodeUnknownEffect(Claims)(yield* rpc("claimReceipts", {}));
    if (
      page.claims.length > page.scanned ||
      new Set(page.claims.map((claim) => claim.deliveryId)).size !== page.claims.length ||
      new Set(page.claims.map((claim) => claim.attemptId)).size !== page.claims.length ||
      new Set(page.claims.map((claim) => claim.ticketId)).size !== page.claims.length
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const outcomes = yield* Effect.forEach(
      page.claims,
      (claim) =>
        worker.receipt(claim).pipe(
          Effect.map((status) => ({
            deliveryId: claim.deliveryId,
            attemptId: claim.attemptId,
            status,
          })),
          Effect.catch(() =>
            Effect.succeed({
              deliveryId: claim.deliveryId,
              attemptId: claim.attemptId,
              status: "failed" as const,
            }),
          ),
        ),
      { concurrency: 4 },
    );
    return { scanned: page.scanned, outcomes };
  }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
}
