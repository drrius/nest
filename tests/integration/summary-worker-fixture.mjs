import { readFileSync } from "node:fs";
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
  if (f.db.sql("select to_regclass('public.nest_meal_reminders') is null") === "t") {
    for (const name of [
      "20260923042902_native_meal_reminder_storage",
      "20260923045116_native_meal_reminder_schedule",
      "20260923045445_native_meal_push_claims",
    ])
      f.db.file(`supabase/migrations/${name}.sql`);
  }
  f.db.file("supabase/migrations/20260923050126_native_meal_push_scan.sql");
  loadGrocery(f.db);
  const http = await postgrestFixture(t, [], f.db);
  const baseRpc = pushWorkerRpc(
    { url: http.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(http.serverKey),
  );
  return { ...f, baseRpc, rpc: summaryPushRpc(baseRpc) };
}

function loadGrocery(db) {
  if (db.sql("select to_regclass('public.nest_grocery_reminders') is null") === "t") {
    if (db.sql("select to_regclass('public.grocery_items') is null") === "t") {
      const tables = readFileSync("tests/database/ai-grocery-reminder-tables.sql", "utf8");
      const category = tables.indexOf("-- Audited additions");
      const alter = tables.indexOf("alter table public.grocery_items");
      db.sql(tables.slice(0, category));
      if (db.sql("select to_regclass('public.grocery_categories') is null") === "t")
        db.sql(tables.slice(category, alter));
      db.sql(tables.slice(alter));
      db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
    }
    for (const name of [
      "20260923051033_native_dated_reminder_settings",
      "20260923051148_native_grocery_reminder_storage",
      "20260923053557_native_grocery_reminder_schedule",
      "20260923053844_native_grocery_push_claims",
    ])
      db.file(`supabase/migrations/${name}.sql`);
  }
  db.file("supabase/migrations/20260923054801_native_grocery_push_scan.sql");
}
