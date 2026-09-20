import { fixture as removalFixture, id, as, week } from "./meal-removal-fixture.mjs";
import { createRequire } from "node:module";
import { MealReplacementReceipt } from "../../packages/contracts/src/meal-replacement.ts";
export { id, as, week };
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
export const command = (operation, input, scope = {}) =>
  as(
    `select public.nest_replace_meal('${scope.household ?? id(10)}','${operation}','${JSON.stringify(input).replaceAll("'", "''")}')`,
    scope.actor,
  );
export function fixture(t) {
  const f = removalFixture(),
    { db } = f;
  t?.after(() => db.stop());
  db.file("supabase/migrations/20260920221646_native_meal_replacement_command.sql");
  db.file("tests/database/meal-move-grocery-fixture.sql");
  const entry = f.add(600).entryId;
  db.sql(`update public.meal_plan_entries set slot='lunch' where id='${entry}'`);
  const input = () => ({ ...f.baseline(entry), date: week, slot: "lunch", title: "New soup" });
  const replace = (operation, value, scope) =>
    Schema.decodeUnknownSync(MealReplacementReceipt)(
      JSON.parse(db.sql(command(operation, value, scope))),
      { onExcessProperty: "error" },
    );
  const snapshot = () =>
    Object.fromEntries(
      [
        "meal_plan_entries",
        "nest_meal_week_revisions",
        "routine_occurrences",
        "routines",
        "routine_command_receipts",
        "reminder_candidates",
        "inbox_notifications",
        "activity_events",
        "grocery_items",
        "nest_meal_removal_receipts",
        "nest_meal_placement_receipts",
        "nest_meal_replacement_receipts",
      ].map((table) => [
        table,
        db.sql(
          `select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text from public.${table} r`,
        ),
      ]),
    );
  return { ...f, entry, input, replace, snapshot };
}
