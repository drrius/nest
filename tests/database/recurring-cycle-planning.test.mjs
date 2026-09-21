import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { firstUncoveredRecurringCycle } from "../../packages/domain/src/money/recurring-cycle.ts";
const require = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = require("fast-check");
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-expense-fixture.sql");
db.file("supabase/migrations/20260921190528_native_recurring_cycle_planning.sql");
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sqlDate = (value) => (value === null ? "null::date" : `date '${value}'`);
const call = (plan, from, covered = null) =>
  `private.nest_recurring_cycle(${json(plan)},${sqlDate(from)},${sqlDate(covered)})`;
const read = (plan, from, covered = null) =>
  JSON.parse(db.sql(`select coalesce(${call(plan, from, covered)},'null'::jsonb)`));

test("database calendar periods match civil-week, clamped-month and prospective edit examples", () => {
  for (const [plan, from, covered] of [
    [{ kind: "weekly", weekday: 1 }, "0001-01-01", null],
    [{ kind: "weekly", weekday: 5 }, "9999-12-31", null],
    [{ kind: "weekly", weekday: 7 }, "9999-12-31", null],
    [{ kind: "weekly", weekday: 1 }, "2026-01-20", "2026-01-31"],
    [{ kind: "monthly", dayOfMonth: 31 }, "2026-02-02", "2026-02-08"],
    [{ kind: "monthly", dayOfMonth: 31 }, "2026-09-15", "2026-01-31"],
    [{ kind: "monthly", dayOfMonth: 31 }, "0001-02-01", null],
    [{ kind: "monthly", dayOfMonth: 31 }, "2000-02-01", null],
    [{ kind: "monthly", dayOfMonth: 31 }, "2100-02-01", null],
    [{ kind: "monthly", dayOfMonth: 31 }, "9999-12-01", "9999-12-01"],
    [{ kind: "monthly", dayOfMonth: 1 }, "9999-12-02", null],
    [{ kind: "monthly", dayOfMonth: 31 }, "2026-01-01", "9999-12-31"],
  ]) {
    assert.deepEqual(
      read(plan, from, covered),
      firstUncoveredRecurringCycle(plan, {
        from,
        coveredThrough: covered,
      }),
    );
  }
});

test("1,500 generated database plans agree with domain planning across dates and coverage", () => {
  const plan = fc.oneof(
    fc.integer({ min: 1, max: 31 }).map((dayOfMonth) => ({ kind: "monthly", dayOfMonth })),
    fc.integer({ min: 1, max: 7 }).map((weekday) => ({ kind: "weekly", weekday })),
  );
  const date = fc
    .tuple(
      fc.integer({ min: 1, max: 9999 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
    )
    .map(
      ([y, m, d]) =>
        `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  const inputs = fc.sample(fc.tuple(plan, date, fc.option(date, { nil: null })), {
    seed: 20260925,
    numRuns: 1500,
  });
  for (let start = 0; start < inputs.length; start += 100) {
    const batch = inputs.slice(start, start + 100);
    const query = batch
      .map(([p, from, covered], i) => `(${i},${call(p, from, covered)})`)
      .join(",");
    const actual = JSON.parse(
      db.sql(
        `select jsonb_agg(result order by ordinal) from (values ${query}) as plans(ordinal,result)`,
      ),
    );
    const expected = batch.map(([p, from, covered]) =>
      firstUncoveredRecurringCycle(p, {
        from,
        coveredThrough: covered,
      }),
    );
    assert.deepEqual(actual, expected);
  }
});

test("invalid schedules/date ranges fail even at exhaustion and helpers grant no caller authority", () => {
  for (const plan of [
    null,
    [],
    {},
    { kind: "daily" },
    { kind: "weekly", weekday: 0 },
    { kind: "weekly", weekday: 8 },
    { kind: "weekly", weekday: "1" },
    { kind: "weekly", weekday: 1.1 },
    { kind: "monthly", dayOfMonth: 32 },
    { kind: "monthly", dayOfMonth: null },
    { kind: "monthly", dayOfMonth: 1, extra: true },
  ])
    assert.throws(() => read(plan, "2026-01-01", "9999-12-31"), /Invalid recurring/);
  const plan = { kind: "weekly", weekday: 1 };
  for (const value of [null, "infinity", "-infinity", "0001-01-01 BC", "10000-01-01"])
    assert.throws(() => read(plan, value), /Invalid recurring date/);
  for (const value of ["infinity", "-infinity", "0001-01-01 BC", "10000-01-01"])
    assert.throws(() => read(plan, "2026-01-01", value), /Invalid recurring coverage/);
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => db.sql(`set role ${role}; select ${call(plan, "2026-01-01")}`),
      /permission denied/,
    );
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(
    db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in ('nest_recurring_day','nest_first_recurring_date','nest_recurring_cycle')
    and (p.prosecdef or p.provolatile<>'i')`),
    "0",
  );
});
