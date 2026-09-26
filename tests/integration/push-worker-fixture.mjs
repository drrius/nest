import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { deliveryFixture } from "../database/push-delivery-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
export async function pushWorkerFixture(t) {
  const f = deliveryFixture(t);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923003827_native_push_receipt_polling",
    "20260923005427_native_push_worker_rpc",
    "20260923005723_native_push_delivery_scan",
    "20260923010425_native_push_scan_checkpoint",
    "20260923011300_native_push_maintenance",
    "20260922235848_native_push_cancellation",
    "20260923024143_native_summary_push_checkpoint",
    "20260923042122_native_chore_push_scan",
    "20260923050126_native_meal_push_scan",
    "20260923054801_native_grocery_push_scan",
    "20260923063134_native_recurring_push_scan",
    "20260926103643_native_push_nonretryable_conflicts",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const http = await postgrestFixture(t, [], f.db);
  const config = { url: http.url, publishableKey: "sb_publishable_fixture" };
  const rpc = pushWorkerRpc(config, Redacted.make(http.serverKey));
  return { ...f, http, config, rpc };
}
