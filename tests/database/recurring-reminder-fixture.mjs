import { readFileSync } from "node:fs";
import { fixture as recurring, id, as, json } from "./recurring-worker-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = recurring(t);
  for (const [name, end] of [
    ["20260921120810_native_ai_expense_proposal", "create function private.nest_canonical_expense"],
    [
      "20260922213246_native_renewal_reminder_storage",
      "create table public.nest_renewal_reminders",
    ],
  ]) {
    const source = readFileSync(`supabase/migrations/${name}.sql`, "utf8");
    if (
      name.includes("expense") &&
      f.db.sql("select to_regprocedure('private.nest_expense_uuid(jsonb,boolean)') is not null") ===
        "t"
    )
      continue;
    f.db.sql(source.slice(0, source.indexOf(end)));
  }
  f.db.file("supabase/migrations/20260921192022_native_recurring_reads.sql");
  f.db.file("supabase/migrations/20260923051033_native_dated_reminder_settings.sql");
  f.db.file("supabase/migrations/20260923055905_native_recurring_reminder_storage.sql");
  const input = {
    ruleId: f.input.ruleId,
    expectedRuleRevision: f.input.revision,
    expectedDueOn: f.input.dueOn,
    expectedRevision: null,
    settings: { enabled: true, recipientIds: [id(1), id(2)], localTime: "09:00", daysBefore: 0 },
  };
  const saveSql = (value = input, operation = id(2000)) =>
    `select public.nest_save_recurring_reminder('${id(10)}','${operation}',${json(value)})`;
  const save = (value = input, operation = id(2000), actor = 1) =>
    JSON.parse(f.db.sql(as(actor, saveSql(value, operation))));
  const recover = (operation = id(2000), cancel = false, actor = 1) =>
    JSON.parse(
      f.db.sql(
        as(
          actor,
          `select public.nest_${cancel ? "cancel" : "read"}_recurring_reminder_operation('${id(10)}','${operation}')`,
        ),
      ),
    );
  return { ...f, input, saveSql, save, recover };
}
