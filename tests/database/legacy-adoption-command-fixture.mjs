import { fixture as context, id, as, json } from "./legacy-adoption-context-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = context(t);
  f.db.file("supabase/migrations/20260922192907_native_legacy_adoption_command.sql");
  const configuration = JSON.parse(
    f.db.sql(`select configuration from public.nest_recurring_rules where id='${id(300)}'`),
  );
  const input = () => ({
    ruleId: id(800),
    reviewToken: f.context().reviewToken,
    configuration,
    firstDueOn: f.today,
  });
  /** @param {unknown} [value] @param {number} [op] @param {string|null} [approval] */
  const command = (value = input(), op = 850, approval = null) =>
    approval === null
      ? `select public.nest_save_legacy_adoption('${id(10)}','${id(op)}',${json(value)})`
      : `select public.nest_execute_legacy_adoption('${id(10)}','${id(op)}',${json(value)},'${approval}')`;
  const recovery = (op = 850, cancel = false) =>
    `select public.nest_${cancel ? "cancel" : "read"}_legacy_adoption('${id(10)}','${id(op)}')`;
  return { ...f, input, command, recovery };
}
