import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { fixture } from "../database/summary-push-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
import { summaryPushRpc } from "../../apps/api/src/push/summary-rpc.ts";
export async function summaryWorkerFixture(t, databaseFixture = fixture) {
  const f = databaseFixture(t);
  for (const name of [
    "20260923005427_native_push_worker_rpc",
    "20260923005723_native_push_delivery_scan",
    "20260923011300_native_push_maintenance",
    "20260923014646_native_daily_summary_scan",
    "20260923024331_native_summary_push_maintenance",
    "20260923010425_native_push_scan_checkpoint",
    "20260923023514_native_summary_push_scan",
    "20260923024143_native_summary_push_checkpoint",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  if (f.db.sql("select to_regclass('public.nest_chore_reminders') is null") === "t") {
    for (const name of [
      "20260923033231_native_chore_reminder_storage",
      "20260923040649_native_chore_reminder_schedule",
      "20260923041151_native_chore_push_claims",
    ])
      f.db.file(`supabase/migrations/${name}.sql`);
  }
  f.db.file("supabase/migrations/20260923042122_native_chore_push_scan.sql");
  const http = await postgrestFixture(t, [], f.db);
  const baseRpc = pushWorkerRpc(
    { url: http.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(http.serverKey),
  );
  return { ...f, baseRpc, rpc: summaryPushRpc(baseRpc) };
}
