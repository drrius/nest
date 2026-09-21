import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as } from "./recurring-manual-fixture.mjs";
import { approve } from "./recurring-mandate-fixture.mjs";
import { command as correct } from "./native-correction-fixture.mjs";
import { ManualCycleReceipt } from "../../packages/contracts/src/recurring-manual.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const ledger = (db) =>
  db.sql("select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l");
test("manual linkage consumes one cycle with unchanged ledger and immutable history after correction", async (t) => {
  const f = fixture(t),
    input = f.setup(),
    before = ledger(f.db);
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.command(input)))),
  );
  const result = JSON.parse(rows[0].stdout);
  for (const row of rows) assert.deepEqual(JSON.parse(row.stdout), result);
  assert.equal(Schema.is(ManualCycleReceipt)(result), true);
  assert.equal(result.linkedExpense.event.amountCentimes, "990");
  assert.equal(result.configuration.amountCentimes, "101");
  assert.equal(ledger(f.db), before);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.throws(() => f.record(f.command(input, 501)));
  assert.throws(() => f.record(f.command(input), 2));
  f.record(
    correct(900, {
      sourceEventId: input.sourceEventId,
      expectedReversalId: null,
      replacement: null,
    }),
  );
  assert.deepEqual(f.record(f.command(input)), result);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.throws(() =>
    f.db.sql(
      `select private.nest_post_fixed_cycle('${id(10)}','${input.ruleId}','${input.expectedRevision}','${input.dueOn}')`,
    ),
  );
});
test("manual linkage binds explicit approval and rolls consumption, cursor and approval back on receipt failure", (t) => {
  const f = fixture(t),
    input = f.setup(),
    before = ledger(f.db);
  const approval = approve(f.db, 500, input, "recurring.link-cycle");
  f.db.sql(
    "alter table public.nest_recurring_cycle_receipts add constraint fail_manual check(false)",
  );
  assert.throws(() => f.record(f.command(input, 500, approval)));
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  assert.equal(f.db.sql("select next_due_on from private.nest_recurring_execution"), f.today);
  assert.equal(ledger(f.db), before);
  f.db.sql("alter table public.nest_recurring_cycle_receipts drop constraint fail_manual");
  assert.throws(() => f.record(f.command({ ...input, sourceEventId: id(999) }, 500, approval)));
  const result = f.record(f.command(input, 500, approval));
  assert.equal(Schema.is(ManualCycleReceipt)(result), true);
  assert.equal(result.approvalId, approval);
  assert.equal(ledger(f.db), before);
});
test("manual source and due eligibility reject reuse, wrong dates, reversals, foreign identity and abandoned Save", (t) => {
  const f = fixture(t),
    input = f.setup(),
    before = ledger(f.db);
  for (const patch of [
    { ruleId: id(999) },
    { expectedRevision: id(999) },
    { dueOn: "2099-01-01" },
    { sourceEventId: id(999) },
    { approved: true },
  ])
    assert.throws(() => f.record(f.command({ ...input, ...patch })));
  const earlier = f.source(401, "10", "5", "2000-01-01");
  assert.throws(() => f.record(f.command({ ...input, sourceEventId: earlier })));
  f.record(`select public.nest_cancel_recurring_cycle_save('${id(10)}','${id(500)}')`);
  assert.throws(() => f.record(f.command(input)));
  f.record(f.command(input, 501));
  const another = f.setup(301, input.sourceEventId);
  assert.throws(() => f.record(f.command(another, 502)));
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  const reversed = f.source(402);
  f.record(correct(901, { sourceEventId: reversed, expectedReversalId: null, replacement: null }));
  assert.throws(() => f.record(f.command({ ...another, sourceEventId: reversed }, 503)));
  assert.notEqual(ledger(f.db), before); // Only explicit fixture expenses/correction changed money.
  assert.throws(() => f.record(f.command(input), 3));
});
test("link and correction races cannot deadlock or reopen a consumed cycle", async (t) => {
  const f = fixture(t),
    input = f.setup();
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(
      as(
        1,
        correct(901, {
          sourceEventId: input.sourceEventId,
          expectedReversalId: null,
          replacement: null,
        }),
      ),
    ),
  ]);
  assert.equal(results[1].status, "fulfilled");
  assert.equal(
    f.db.sql("select count(*) from public.nest_recurring_cycles"),
    results[0].status === "fulfilled" ? "1" : "0",
  );
  assert.throws(() => f.record(f.command(input, 501)));
});
test("manual linking and automatic posting contend for one shared cycle", async (t) => {
  const f = fixture(t),
    input = f.setup();
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.command(input))),
    f.db.concurrent(
      `select private.nest_post_fixed_cycle('${id(10)}','${input.ruleId}','${input.expectedRevision}','${input.dueOn}')`,
    ),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.financial_events"),
    results[0].status === "fulfilled" ? "1" : "2",
  );
});
