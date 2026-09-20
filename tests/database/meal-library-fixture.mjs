import { createRequire } from "node:module";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealWeekFiles } from "./meal-week-files.mjs";
import { MealLibraryPage, SavedMealEnvelope } from "../../packages/contracts/src/meal-library.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(JSON.parse(value), { onExcessProperty: "error" });
export const mealLibraryFiles = [
  ...mealWeekFiles,
  "tests/database/meal-library-fixture.sql",
  "supabase/migrations/20260920224313_native_meal_library_reads.sql",
];
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export const literal = (value) =>
  value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
export const pageSql = (after = null, revision = null, home = id(10)) =>
  `select public.nest_meal_library_page('${home}',${literal(after)},${literal(revision)})`;
export const recipeSql = (definition = id(200), revision = "0", home = id(10)) =>
  `select public.nest_saved_meal('${home}',${literal(definition)},${literal(revision)})`;
export function fixture(t) {
  const db = startFixturePostgres();
  t?.after(() => db.stop());
  for (const file of mealLibraryFiles) db.file(file);
  return {
    db,
    page: (after = null, revision = null, actor = id(1)) =>
      decode(MealLibraryPage, db.sql(as(pageSql(after, revision), actor))),
    recipe: (definition = id(200), revision = "0", actor = id(1)) =>
      decode(SavedMealEnvelope, db.sql(as(recipeSql(definition, revision), actor))),
  };
}
