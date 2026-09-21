import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id } from "./money-expense-helpers.mjs";
import { firstUncoveredRecurringCycle } from "../../packages/domain/src/money/recurring-cycle.ts";
export { as, id };
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/money-expense-fixture.sql");
  for (const migration of [
    "20260919213407_native_action_approvals",
    "20260921114330_native_expense_command",
    "20260921190528_native_recurring_cycle_planning",
    "20260921191101_native_recurring_mandates",
    "20260921191203_native_recurring_configuration_command",
  ])
    db.file(`supabase/migrations/${migration}.sql`);
  const start = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date+30,'YYYY-MM-DD')",
  );
  const input = (n, configuration = {}, changes = {}) => {
    const config = {
      description: "Synthetic recurring bill",
      mode: "fixed",
      amountCentimes: "101",
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: "50" },
      ],
      payerId: id(1),
      categoryId: null,
      note: null,
      startDate: start,
      schedule: { kind: "monthly", dayOfMonth: 31 },
      ...configuration,
    };
    return {
      ruleId: id(n),
      expectedRevision: null,
      configuration: config,
      firstDueOn: firstUncoveredRecurringCycle(config.schedule, {
        from: config.startDate,
        coveredThrough: null,
      }).dueOn,
      ...changes,
    };
  };
  return { db, input, start };
}
export const save = (n, input) =>
  `select public.nest_save_recurring('${id(10)}','${id(n)}',${json(input)})`;
export const execute = (n, input, approval) =>
  `select public.nest_execute_recurring('${id(10)}','${id(n)}',${json(input)},${approval ? `'${approval}'` : "null"})`;
export const read = (db, sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
export function approve(db, n, input, command = "recurring.create") {
  const approval = db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(n)}','${command}',1,${json(input)})`,
    ),
  );
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(n)}','${command}',1,${json(input)},true)`,
    ),
  );
  return approval;
}
