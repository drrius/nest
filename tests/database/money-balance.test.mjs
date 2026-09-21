import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-ledger-fixture.sql");
db.file("supabase/migrations/20260921103207_native_money_balance_read.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, query) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${query}`;
const balance = (actor = 1, home = 10) =>
  JSON.parse(db.sql(as(actor, `select public.nest_money_balance('${id(home)}')`)));
beforeEach(() =>
  db.sql(
    "truncate public.financial_events,public.financial_allocations,public.ledger_entries cascade",
  ),
);
const event = (n, type = "expense", related = null) =>
  `insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents,related_event_id) values('${id(n)}','${id(10)}','${type}','2026-09-21','${id(1)}',${type === "reversal" ? "null" : `'${id(1)}'`},'Synthetic',100,${related ? `'${id(related)}'` : "null"});`;
const pair = (n, amount) =>
  `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(n)}','${id(1)}',${amount}),('${id(10)}','${id(n)}','${id(2)}',${-amount});`;
test("empty balance is a two-member authorized read, not an opening-balance write", () => {
  const result = balance();
  assert.equal(result.eventCount, "0");
  assert.equal(result.openingEstablished, false);
  assert.deepEqual(
    result.members.map((row) => row.centimes),
    ["0", "0"],
  );
  assert.deepEqual(balance(2), result);
  assert.throws(() => balance(3), /Not authorized/);
  assert.throws(() => balance(1, 20), /Not authorized/);
  assert.throws(() => balance(3, 20), /two household members/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_money_balance('${id(10)}')`),
    /permission denied/,
  );
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("balance includes opening, retained reversals and every event beyond a 500-row page", () => {
  db.sql(
    event(100, "opening_balance") +
      pair(100, 100) +
      event(101) +
      pair(101, 40) +
      event(102, "reversal", 101) +
      pair(102, -40),
  );
  db.sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents)
    select md5('synthetic-'||g)::uuid,'${id(10)}','expense','2026-09-21','${id(1)}','${id(1)}','Synthetic',2 from generate_series(1,600) g;
    insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents)
    select '${id(10)}',md5('synthetic-'||g)::uuid,m.actor,m.delta from generate_series(1,600) g cross join (values('${id(1)}'::uuid,1),('${id(2)}'::uuid,-1)) m(actor,delta);`);
  const result = balance();
  assert.equal(result.eventCount, "603");
  assert.equal(result.openingEstablished, true);
  assert.deepEqual(
    result.members.map((row) => row.centimes),
    ["700", "-700"],
  );
});
test("balance rejects missing and single-zero event pairs rather than reporting free-standing zero", () => {
  db.sql(event(200));
  assert.throws(() => balance(), /Incomplete/);
  db.sql(
    `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(200)}','${id(1)}',0)`,
  );
  assert.throws(() => balance(), /Incomplete/);
  db.sql(
    `insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values('${id(10)}','${id(200)}','${id(2)}',0)`,
  );
  assert.equal(balance().eventCount, "1");
});
test("numeric aggregation preserves exact values beyond JS safe range for contract rejection", () => {
  db.sql(event(300) + pair(300, Number.MAX_SAFE_INTEGER) + event(301) + pair(301, 1));
  assert.deepEqual(
    balance().members.map((row) => row.centimes),
    ["9007199254740992", "-9007199254740992"],
  );
});

test("one statement cannot mix an old count with a newly posted balance while waiting", async () => {
  const holder = db.concurrent(
    "set application_name='money-holder'; begin; select pg_advisory_xact_lock(71529); select pg_sleep(0.6); commit;",
  );
  await waiting("money-holder", "PgSleep");
  const reading = db.concurrent(
    as(
      1,
      `set application_name='money-reader'; with barrier as materialized (select pg_advisory_xact_lock(71529)) select public.nest_money_balance('${id(10)}') from barrier`,
    ),
  );
  await waiting("money-reader", "advisory");
  db.sql(event(400, "opening_balance") + pair(400, 100));
  await holder;
  const old = JSON.parse((await reading).stdout.trim());
  assert.equal(old.eventCount, "0");
  assert.deepEqual(
    old.members.map((row) => row.centimes),
    ["0", "0"],
  );
  assert.equal(balance().eventCount, "1");
  assert.deepEqual(
    balance().members.map((row) => row.centimes),
    ["100", "-100"],
  );
});
async function waiting(name, eventName) {
  for (let n = 0; n < 100; n++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='${eventName}'`,
      ) === "1"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error(`Fixture did not reach ${name}/${eventName}`);
}
