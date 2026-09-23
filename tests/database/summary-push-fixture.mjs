import { deliveryFixture, id, json } from "./push-delivery-fixture.mjs";
import { summaryContentSchema } from "./daily-summary-content-fixture.mjs";
export { id, json };
export function fixture(t, beforeSummary) {
  const f = deliveryFixture(t);
  summaryContentSchema(f.db);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923003827_native_push_receipt_polling",
    "20260923014222_native_daily_summary_schedule",
    "20260923015620_native_daily_summary_snapshot",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const beforeSummaryResult = beforeSummary?.(f);
  for (const name of [
    "20260923021853_native_summary_push_claims",
    "20260923022955_native_summary_push_outcomes",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  f.db.sql(
    "update public.nest_notification_preferences set daily_summary_enabled=true,daily_summary_time='00:00'",
  );
  const summaryId = f.db.sql(
    `select private.nest_schedule_daily_summary('${id(10)}','${id(1)}',(clock_timestamp() at time zone 'Europe/Zurich')::date)`,
  );
  const prepare = () =>
    f.db.sql(`select private.nest_prepare_summary_push('${summaryId}','${id(1702)}')`);
  return { ...f, renewalPrepare: f.prepare, summaryId, prepare, beforeSummaryResult };
}
