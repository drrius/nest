import { groceryPushRpc } from "./grocery-rpc.ts";
import { mealPushRpc } from "./meal-rpc.ts";
import { chorePushRpc } from "./chore-rpc.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { runCheckpointedPushPage } from "./checkpoint-runner.ts";
import { summaryPushRpc } from "./summary-rpc.ts";
import { runPushReceipts } from "./receipt-sweep.ts";
import type { pushWorkerRpc } from "./worker-rpc.ts";
import type { pushDeliveryWorker } from "./delivery-worker.ts";
const count = (maximum: number) => Schema.Int.check(Schema.isBetween({ minimum: 0, maximum }));
const Materialized = Schema.Struct({
  scanned: count(250),
  inserted: count(500),
  wrapped: Schema.Boolean,
});
const ChoreMaintenance = Schema.Struct({
  version: Schema.Literal(1),
  previous: Materialized,
  current: Materialized,
  obsolete: Schema.Struct({ scanned: count(500), cancelled: count(500), wrapped: Schema.Boolean }),
});
const Maintenance = Schema.Struct({
  ...ChoreMaintenance.fields,
  expired: count(100),
  retries: Schema.Struct({ scanned: count(100), requeued: count(100), wrapped: Schema.Boolean }),
});
const SummaryMaintenance = Schema.Struct({
  version: Schema.Literal(1),
  scanned: count(250),
  scheduled: count(250),
  wrapped: Schema.Boolean,
});
function outcome<A, E>(effect: Effect.Effect<A, E>) {
  return effect.pipe(
    Effect.map((report) => ({ status: "recorded" as const, report })),
    Effect.catch(() => Effect.succeed({ status: "failed" as const })),
  );
}
/** A bounded invocation; hosting must schedule later invocations explicitly. */
export function runPushCycle(
  rpc: ReturnType<typeof pushWorkerRpc>,
  worker: ReturnType<typeof pushDeliveryWorker>,
) {
  return Effect.gen(function* () {
    const maintenance = yield* outcome(
      rpc("maintain", {}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Maintenance))),
    );
    const delivery =
      maintenance.status === "recorded"
        ? yield* outcome(runCheckpointedPushPage(rpc, worker))
        : { status: "skipped" as const };
    const summaryMaintenance = yield* outcome(
      rpc("summaryMaintain", {}).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SummaryMaintenance)),
      ),
    );
    const summaryDelivery =
      summaryMaintenance.status === "recorded"
        ? yield* outcome(runCheckpointedPushPage(summaryPushRpc(rpc), worker))
        : { status: "skipped" as const };
    const choreMaintenance = yield* outcome(
      rpc("choreMaintain", {}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChoreMaintenance))),
    );
    const choreDelivery =
      choreMaintenance.status === "recorded"
        ? yield* outcome(runCheckpointedPushPage(chorePushRpc(rpc), worker))
        : { status: "skipped" as const };
    const mealMaintenance = yield* outcome(
      rpc("mealMaintain", {}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChoreMaintenance))),
    );
    const mealDelivery =
      mealMaintenance.status === "recorded"
        ? yield* outcome(runCheckpointedPushPage(mealPushRpc(rpc), worker))
        : { status: "skipped" as const };
    const groceryMaintenance = yield* outcome(
      rpc("groceryMaintain", {}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChoreMaintenance))),
    );
    const groceryDelivery =
      groceryMaintenance.status === "recorded"
        ? yield* outcome(runCheckpointedPushPage(groceryPushRpc(rpc), worker))
        : { status: "skipped" as const };
    // Receipt reads remain useful even when materialization or sending failed.
    const receipts = yield* outcome(runPushReceipts(rpc, worker));
    return {
      maintenance,
      delivery,
      summaryMaintenance,
      summaryDelivery,
      choreMaintenance,
      choreDelivery,
      mealMaintenance,
      mealDelivery,
      groceryMaintenance,
      groceryDelivery,
      receipts,
    };
  });
}
