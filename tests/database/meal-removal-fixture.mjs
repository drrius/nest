import { createRequire } from "node:module";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealRemovalFiles } from "./meal-removal-files.mjs";
import { MealRemovalReceipt } from "../../packages/contracts/src/meal-removal.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
export const decode = (value) =>
  Schema.decodeUnknownSync(MealRemovalReceipt)(value, { onExcessProperty: "error" });
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const week = "2030-01-07";
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export const command = (operation, input, scope = {}) =>
  as(
    `select public.nest_remove_meal('${scope.household ?? id(10)}','${operation}','${JSON.stringify(input).replaceAll("'", "''")}')`,
    scope.actor,
  );
export function fixture() {
  const db = startFixturePostgres();
  for (const file of mealRemovalFiles) db.file(file);
  const baseline = (entry) => ({
    entryId: entry,
    weekStart: week,
    expectedRevision: db.sql(
      `select coalesce((select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${week}'),0)`,
    ),
  });
  const add = (n) => {
    db.sql(
      `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,notes,groceries_materialized_at) values('${id(n)}','${id(10)}','${week}',null,'Saved meal','Retain notes',now())`,
    );
    return baseline(id(n));
  };
  const preparation = (entry, operation) => {
    const definition = {
      title: "Prepare meal",
      schedule: { kind: "one_off", date: week },
      assignment: { policy: "shared" },
    };
    const receipt = JSON.parse(
      db.sql(
        as(
          `select public.nest_create_routine('${id(10)}','${operation}','${JSON.stringify(definition)}')`,
        ),
      ),
    );
    const occurrence = db.sql(
      `select id from public.routine_occurrences where routine_id='${receipt.routineId}' and role='current'`,
    );
    db.sql(
      `update public.routine_occurrences set meal_plan_entry_id='${entry}' where id='${occurrence}'`,
    );
    return occurrence;
  };
  return {
    db,
    baseline,
    add,
    preparation,
    remove: (operation, input, scope) =>
      decode(JSON.parse(db.sql(command(operation, input, scope)))),
  };
}
