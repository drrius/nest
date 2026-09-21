import { fixture as creationFixture, id, as } from "./recipe-creation-fixture.mjs";
export { id, as };
export const recipeArchiveMigration =
  "supabase/migrations/20260920235917_native_recipe_archive.sql";
export const input = (expectedRevision = "0", definitionId = id(200)) => ({
  expectedRevision,
  definitionId,
});
export const command = (operation, payload = input(), actor = id(1), household = id(10)) =>
  as(
    `select public.nest_archive_recipe('${household}','${operation}','${JSON.stringify(payload).replaceAll("'", "''")}')`,
    actor,
  );
export function fixture(t) {
  const f = creationFixture(t);
  f.db.file(recipeArchiveMigration);
  const archive = (operation, payload = input(), actor, household) =>
    JSON.parse(f.db.sql(command(operation, payload, actor, household)));
  return { ...f, archive };
}
