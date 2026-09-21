import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-ledger-fixture.sql");
db.file("supabase/migrations/20260921105214_native_money_detail_read.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const detail = (event = 100, actor = 1, home = 10) =>
  JSON.parse(
    db.sql(
      `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; select public.nest_money_detail('${id(home)}','${id(event)}')`,
    ),
  );
beforeEach(() => {
  db.sql(
    "truncate public.expense_categories,public.financial_events,public.financial_allocations,public.ledger_entries cascade",
  );
  db.file("tests/database/money-detail-seed.sql");
});
test("detail retains split, note, archived category and bidirectional reversal identity without receipt paths", () => {
  const original = detail();
  assert.equal(original.event.hasReceipt, true);
  assert.equal(original.event.occurredOn, "infinity");
  assert.equal(original.note, "Retained note");
  assert.equal(original.category.name, "Archived category");
  assert.equal(original.reversedById, id(101));
  assert.deepEqual(
    original.shares.map((row) => [row.allocatedCentimes, row.deltaCentimes]),
    [
      ["51", "50"],
      ["50", "-50"],
    ],
  );
  assert.deepEqual(detail(100, 2), original);
  assert.equal(detail(101).event.relatedEventId, id(100));
  assert.equal(detail(102).event.relatedEventId, id(100));
  assert.equal(detail(103).event.relatedEventId, id(102));
  assert.equal(detail(105).event.amountCentimes, "9007199254740991");
  assert.doesNotMatch(JSON.stringify(original), /receipt.jpg|private\//);
});
test("detail rejects missing/incomplete history and incorrect reversal projections", () => {
  db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents)
    values('${id(200)}','${id(10)}','expense','2026-09-21','${id(1)}','${id(1)}','Incomplete',0)`);
  assert.throws(() => detail(200), /Incomplete ledger projection/);
  db.sql(
    `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(200)}','${id(1)}',0)`,
  );
  assert.throws(() => detail(200), /Incomplete ledger projection/);
  db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents,related_event_id)
    values('${id(201)}','${id(10)}','reversal','2026-09-21','${id(1)}',null,'Bad reversal',90,'${id(102)}');
    insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values
    ('${id(10)}','${id(201)}','${id(1)}',0),('${id(10)}','${id(201)}','${id(2)}',0)`);
  assert.throws(() => detail(201), /Invalid reversal projection/);
});
test("foreign and absent detail IDs have the same result and anonymous/nonmembers cannot read", () => {
  assert.throws(() => detail(100, 3, 20), /Financial event unavailable/);
  assert.throws(() => detail(999, 3, 20), /Financial event unavailable/);
  assert.throws(() => detail(100, 3), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_money_detail('${id(10)}','${id(100)}')`),
    /permission denied/,
  );
});
