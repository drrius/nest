import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-ledger-fixture.sql");
db.file("supabase/migrations/20260921104133_native_money_history_read.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
/** @param {string|null} before */
const page = (before = null, actor = 1, home = 10) =>
  JSON.parse(
    db.sql(
      as(
        actor,
        `select public.nest_money_history('${id(home)}',${before ? `'${before}'` : "null"})`,
      ),
    ),
  );
beforeEach(() =>
  db.sql(
    "truncate public.financial_events,public.ledger_entries,public.financial_allocations cascade",
  ),
);
function seed(count = 123) {
  db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_at,created_by_member_id,payer_member_id,description,amount_cents)
  select md5('history-'||g)::uuid,'${id(10)}','expense','2026-09-21'::date-(g%3),
  '2026-09-21T12:00:00Z'::timestamptz+(g%4)*interval '1 microsecond','${id(1)}','${id(1)}','Synthetic',g from generate_series(1,${count}) g;`);
}
test("keyset history walks all microsecond/date/UUID ties without truncation or duplication", () => {
  seed();
  const found = [];
  let before = null;
  do {
    const result = page(before);
    assert.equal(result.before, before);
    found.push(...result.events.map((row) => row.eventId));
    before = result.next;
  } while (before);
  const expected = JSON.parse(
    db.sql(
      "select json_agg(id order by occurred_on desc,created_at desc,id desc) from public.financial_events",
    ),
  );
  assert.deepEqual(found, expected);
  assert.equal(new Set(found).size, 123);
  assert.match(page().events[0].createdAt, /\.000003Z$/);
  assert.deepEqual(page(null, 2), page());
});
test("new top entries do not shift later pages; exact full last page has no next cursor", () => {
  seed(100);
  const first = page();
  db.sql(
    `insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents) values('${id(999)}','${id(10)}','opening_balance','2026-09-22','${id(1)}','${id(1)}','Opening',9007199254740991)`,
  );
  const second = page(first.next);
  assert.equal(second.events.length, 50);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.events, ...second.events].map((row) => row.eventId)).size, 100);
  assert.equal(page().events[0].amountCentimes, "9007199254740991");
});
test("history preserves correction relationships and keeps receipt paths out of summaries", () => {
  db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_at,created_by_member_id,payer_member_id,description,amount_cents,receipt_path,related_event_id) values
  ('${id(100)}','${id(10)}','expense','2026-09-21','2026-09-21T12:00:00.000001Z','${id(1)}','${id(1)}','Original',100,'private/receipt.jpg',null),
  ('${id(101)}','${id(10)}','reversal','2026-09-21','2026-09-21T12:00:00.000002Z','${id(1)}',null,'Correction',100,null,'${id(100)}'),
  ('${id(102)}','${id(10)}','replacement','2026-09-21','2026-09-21T12:00:00.000003Z','${id(1)}','${id(1)}','Replacement',90,null,'${id(100)}')`);
  const result = page();
  assert.deepEqual(
    result.events.map((row) => row.kind),
    ["replacement", "reversal", "expense"],
  );
  assert.equal(result.events[1].relatedEventId, id(100));
  assert.equal(result.events[2].hasReceipt, true);
  assert.doesNotMatch(JSON.stringify(result), /private\/|receipt.jpg/);
});
test("foreign and missing cursor IDs are indistinguishable and anonymous/nonmembers cannot read", () => {
  seed(1);
  const cursor = page().events[0].eventId;
  assert.throws(() => page(cursor, 3, 20), /History cursor unavailable/);
  assert.throws(() => page(id(999), 3, 20), /History cursor unavailable/);
  assert.throws(() => page(null, 3), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_money_history('${id(10)}')`),
    /permission denied/,
  );
});
