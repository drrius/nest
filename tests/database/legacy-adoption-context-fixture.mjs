import { fixture as legacy, id, as, json } from "./legacy-recurring-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = legacy(t);
  f.db.file("supabase/migrations/20260922033013_native_legacy_recurring_fences.sql");
  f.db.file("supabase/migrations/20260922034111_native_legacy_adoption_context.sql");
  f.rule();
  const query = (rule = 800, home = 10) =>
    `select public.nest_read_legacy_adoption_context('${id(home)}','${id(rule)}')`;
  const context = (actor = 1) => f.record(query(), actor);
  return { ...f, query, context };
}
