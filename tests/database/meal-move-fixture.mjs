import { fixture as removalFixture, id, as, week } from "./meal-removal-fixture.mjs";
import { createRequire } from "node:module";
import { MealMoveReceipt } from "../../packages/contracts/src/meal-move.ts";
export { id, as, week };
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
export const command = (operation, input, scope = {}) =>
  as(
    `select public.nest_move_meal('${scope.household ?? id(10)}','${operation}','${JSON.stringify(input).replaceAll("'", "''")}')`,
    scope.actor,
  );
export function fixture() {
  const f = removalFixture(),
    { db } = f;
  db.file("supabase/migrations/20260920214557_native_meal_move_command.sql");
  db.file("tests/database/meal-move-grocery-fixture.sql");
  const revision = (date) =>
    db.sql(
      `select coalesce((select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${date}'),0)`,
    );
  const input = (entry, targetWeekStart = "2030-01-14", sourceWeekStart = week) => ({
    entryId: entry,
    sourceWeekStart,
    targetWeekStart,
    expectedSourceRevision: revision(sourceWeekStart),
    expectedTargetRevision: revision(targetWeekStart),
    date: targetWeekStart,
    slot: "lunch",
  });
  const move = (operation, value, scope) =>
    Schema.decodeUnknownSync(MealMoveReceipt)(
      JSON.parse(db.sql(command(operation, value, scope))),
      { onExcessProperty: "error" },
    );
  return { ...f, revision, input, move };
}
