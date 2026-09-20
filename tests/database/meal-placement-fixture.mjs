import { createRequire } from "node:module";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealPlacementFiles } from "./meal-placement-files.mjs";
import {
  MealPlacementReceipt,
  PlaceMealInput,
} from "../../packages/contracts/src/meal-placement.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
export const valid = Schema.is(PlaceMealInput);
export const decode = (value) =>
  Schema.decodeUnknownSync(MealPlacementReceipt)(value, { onExcessProperty: "error" });
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const input = (date = "2026-09-22", overrides = {}) => ({
  weekStart: "2026-09-21",
  expectedRevision: "0",
  date,
  slot: "lunch",
  title: "One-off pasta",
  ...overrides,
});
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export const command = (operation, payload = input(), scope = {}) =>
  as(
    `select public.nest_place_meal('${scope.household ?? id(10)}','${operation}','${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)`,
    scope.actor,
  );
export function fixture() {
  const db = startFixturePostgres();
  for (const file of mealPlacementFiles) db.file(file);
  return {
    db,
    place: (operation, payload = input(), scope = {}) =>
      decode(JSON.parse(db.sql(command(operation, payload, scope)))),
    read: (week = "2026-09-21") =>
      JSON.parse(db.sql(as(`select public.nest_meal_week_snapshot('${id(10)}','${week}')`))),
  };
}
