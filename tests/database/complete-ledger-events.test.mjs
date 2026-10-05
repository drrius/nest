import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id, save, execute, propose, payload } from "./native-expense-helpers.mjs";

const migration = "supabase/migrations/20261005131837_native_complete_ledger_events.sql";
const source = readFileSync(migration, "utf8");
function fixture(t, apply = true) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/money-expense-fixture.sql");
  if (apply) db.sql(`begin;${source}commit;`);
  return db;
}
function event(n, type = "expense", related = null) {
  return `insert into public.financial_events(id,household_id,type,occurred_on,
    created_by_member_id,payer_member_id,description,amount_cents,related_event_id)
    values('${id(n)}','${id(10)}','${type}','2026-10-05','${id(1)}',
    ${type === "reversal" ? "null" : `'${id(1)}'`},'Ledger pair fixture',0,
    ${related === null ? "null" : `'${id(related)}'`});`;
}
const entry = (n, actor, delta) => `insert into public.ledger_entries
  (household_id,financial_event_id,member_id,receivable_delta_cents)
  values('${id(10)}','${id(n)}','${id(actor)}',${delta});`;
const pair = (n, delta = 0) => `insert into public.ledger_entries
  (household_id,financial_event_id,member_id,receivable_delta_cents) values
  ('${id(10)}','${id(n)}','${id(1)}',${delta}),
  ('${id(10)}','${id(n)}','${id(2)}',${-delta});`;
function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'events',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.financial_events t),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.financial_allocations t),
    'entries',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.ledger_entries t))`);
}
function native(db) {
  db.file("supabase/migrations/20260919213407_native_action_approvals.sql");
  db.file("supabase/migrations/20260921114330_native_expense_command.sql");
}

test("retained trigger permits no-entry and one-zero-entry events; migration refuses and preserves them", (t) => {
  const db = fixture(t, false);
  db.sql(event(100));
  db.sql(event(101) + entry(101, 1, 0));
  const before = snapshot(db);
  assert.throws(() => db.sql(`begin;${source}commit;`), /complete two-member zero-sum ledger pair/);
  assert.equal(snapshot(db), before);
  assert.equal(db.sql("select count(*) from pg_trigger where tgname like 'nest_%complete_%'"), "0");
  assert.equal(
    db.sql("select count(*) from pg_proc where proname like 'nest_%complete_ledger_event'"),
    "0",
  );
});

test("commit refuses incomplete new events and rolls back their complete transaction", (t) => {
  const db = fixture(t);
  const before = snapshot(db);
  for (const entries of ["", entry(110, 1, 0)]) {
    assert.throws(() => db.sql(`begin;${event(110)}${entries}commit;`), /complete two-member/);
    assert.equal(snapshot(db), before);
  }
  assert.throws(() => db.sql(event(111)), /complete two-member/);
  assert.equal(snapshot(db), before);
});

test("deferred validation allows separate zero-entry statements inside one transaction", (t) => {
  const db = fixture(t);
  db.sql(`begin;${event(120)}${entry(120, 1, 0)}${entry(120, 2, 0)}commit;`);
  assert.equal(db.sql("select count(*) from public.ledger_entries"), "2");
  const before = snapshot(db);
  assert.throws(
    () => db.sql(`begin;${event(121)}set constraints all immediate;commit;`),
    /complete two-member/,
  );
  assert.equal(snapshot(db), before);
});

test("complete pairs survive safe-integer endpoints and 256 deterministic positive/negative cases", (t) => {
  const db = fixture(t);
  const values = [0, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
  for (let n = 0; n < 256; n++) values.push(((n * 7919) % 100001) - 50000);
  for (let start = 0; start < values.length; start += 32) {
    const sql = values
      .slice(start, start + 32)
      .map((v, n) => event(1000 + start + n) + pair(1000 + start + n, v))
      .join("\n");
    db.sql(`begin;${sql};commit;`);
  }
  assert.equal(db.sql("select count(*) from public.financial_events"), String(values.length));
  assert.equal(
    db.sql(`select bool_and(pairs=2 and distinct_members=2 and total=0) from (
    select count(*) as pairs,count(distinct member_id) as distinct_members,sum(receivable_delta_cents) as total
    from public.ledger_entries group by financial_event_id) t`),
    "t",
  );
});

test("foreign members, duplicate members, unbalanced rows and history changes remain refused", (t) => {
  const db = fixture(t);
  db.sql(`begin;${event(130)}${pair(130)}commit;`);
  const before = snapshot(db);
  for (const sql of [
    event(131) + entry(131, 3, 0),
    event(131) + entry(131, 1, 0) + entry(131, 1, 0),
    event(131) + entry(131, 1, 1),
    "update public.ledger_entries set receivable_delta_cents=0",
    "delete from public.financial_events",
  ]) {
    assert.throws(
      () => db.sql(`begin;${sql};commit;`),
      /foreign key|duplicate key|sum to zero|append-only/,
    );
    assert.equal(snapshot(db), before);
  }
});

test("internal guards are not client RPCs and a trusted service cannot commit incomplete history", (t) => {
  const db = fixture(t);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(
      db.sql(`select bool_or(has_function_privilege('${role}',oid,'EXECUTE'))
      from pg_proc where proname in ('nest_require_complete_ledger_event','nest_check_complete_ledger_event')`),
      "f",
    );
  }
  assert.equal(
    db.sql(`select bool_and(prosecdef and proconfig=array['search_path=""'])
    from pg_proc where proname in ('nest_require_complete_ledger_event','nest_check_complete_ledger_event')`),
    "t",
  );
  for (const actor of [1, 2, 3]) {
    assert.throws(() => db.sql(as(actor, event(140))), /permission denied/);
    assert.throws(
      () => db.sql(as(actor, `select private.nest_require_complete_ledger_event('${id(140)}')`)),
      /permission denied/,
    );
  }
  db.sql("grant select,insert on public.financial_events,public.ledger_entries to service_role");
  const before = snapshot(db);
  assert.throws(
    () => db.sql(`begin;set local role service_role;${event(140)}${entry(140, 1, 0)}commit;`),
    /complete two-member/,
  );
  assert.equal(snapshot(db), before);
  db.sql(`begin;set local role service_role;${event(141)}${pair(141)}commit;`);
});

test("authorized native posting and concurrent exact retries produce one complete ledger pair", async (t) => {
  const db = fixture(t);
  native(db);
  const replies = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(as(1, save(150)))),
  );
  const receipts = replies.map((r) => JSON.parse(r.stdout.trim()));
  assert.equal(new Set(receipts.map((r) => r.eventId)).size, 1);
  assert.equal(db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(db.sql("select count(*) from public.ledger_entries"), "2");
  assert.equal(db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.throws(() => db.sql(as(3, save(151))), /Not authorized/);
  assert.equal(db.sql(as(3, "select count(*) from public.financial_events")), "0");
  assert.equal(db.sql(as(2, "select count(*) from public.financial_events")), "1");
});

test("pair constraints do not grant AI financial approval or bypass changed-payload rejection", (t) => {
  const db = fixture(t);
  native(db);
  assert.throws(() => db.sql(as(1, execute(160, null))), /Invalid approval|Approval|approval/);
  const approval = propose(db, 160);
  assert.throws(() => db.sql(as(1, execute(160, approval))), /approved|approval/);
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(160)}','expenses.record',1,
    '${JSON.stringify(payload())}'::jsonb,true)`,
    ),
  );
  assert.throws(
    () => db.sql(as(1, execute(160, approval, payload({ note: "Changed" })))),
    /approval/,
  );
  db.sql(as(1, execute(160, approval)));
  assert.equal(db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(db.sql("select count(*) from public.ledger_entries"), "2");
});
