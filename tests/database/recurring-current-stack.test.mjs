import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, as, id, json } from "./expense-receipt-fixture.mjs";
import { RecurringReceipt } from "../../packages/contracts/src/recurring.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
test("recurring mandates compose with current grocery/receipt expense validation and shared contracts", (t) => {
  const { db } = fixture(t);
  for (const file of [
    "20260921190528_native_recurring_cycle_planning",
    "20260921191101_native_recurring_mandates",
    "20260921191203_native_recurring_configuration_command",
  ])
    db.file(`supabase/migrations/${file}.sql`);
  const start = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date+30,'YYYY-MM-DD')",
  );
  const configuration = {
    description: "Fixed native mandate",
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
  };
  const first = db.sql(
    `select private.nest_recurring_cycle(${json(configuration.schedule)},'${start}',null)->>'dueOn'`,
  );
  const input = { ruleId: id(990), expectedRevision: null, configuration, firstDueOn: first };
  const result = JSON.parse(
    db.sql(as(`select public.nest_save_recurring('${id(10)}','${id(991)}',${json(input)})`)),
  );
  assert.deepEqual(
    Schema.decodeUnknownSync(RecurringReceipt, { onExcessProperty: "error" })(result),
    result,
  );
  assert.deepEqual(result.rule, input);
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
  const anonymous = `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1), is_anonymous: true })}';`;
  assert.throws(
    () =>
      db.sql(
        `${anonymous} select public.nest_save_recurring('${id(10)}','${id(992)}',${json({ ...input, ruleId: id(993) })})`,
      ),
    /Not authorized/,
  );
});
