import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id, save, execute, propose, decide, payload } from "./native-expense-helpers.mjs";

const source = readFileSync(
  "supabase/migrations/20261005135405_native_financial_allocation_consistency.sql",
  "utf8",
);
function fixture(t, apply = true) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/money-expense-fixture.sql");
  db.file("supabase/migrations/20261005131837_native_complete_ledger_events.sql");
  if (apply) db.sql(`begin;${source}commit;`);
  return db;
}
function event({ n, amount = 2, payer = 1, type = "expense", related = null }) {
  return `insert into public.financial_events(id,household_id,type,occurred_on,
    created_by_member_id,payer_member_id,description,amount_cents,related_event_id)
    values('${id(n)}','${id(10)}','${type}','2026-10-05','${id(1)}','${id(payer)}',
    'Allocation consistency fixture',${amount},${related === null ? "null" : `'${id(related)}'`});`;
}
const allocation = (n, actor, cents) => `insert into public.financial_allocations
  (household_id,financial_event_id,member_id,allocated_cents)
  values('${id(10)}','${id(n)}','${id(actor)}',${cents});`;
const pair = (n, delta = 1) => `insert into public.ledger_entries
  (household_id,financial_event_id,member_id,receivable_delta_cents) values
  ('${id(10)}','${id(n)}','${id(1)}',${delta}),
  ('${id(10)}','${id(n)}','${id(2)}',${-delta});`;
function complete(input) {
  const { n, amount = 2, firstShare = 1, payer = 1, type = "expense" } = input;
  const delta = (type === "refund" ? -1 : 1) * (payer === 1 ? amount - firstShare : -firstShare);
  return (
    event(input) +
    allocation(n, 1, firstShare) +
    allocation(n, 2, amount - firstShare) +
    pair(n, delta)
  );
}
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

test("balanced legacy events can lack allocations or disagree with them; migration refuses without repair", (t) => {
  for (const shares of ["", allocation(100, 1, 1) + allocation(100, 2, 1)]) {
    const db = fixture(t, false);
    db.sql(`begin;${event({ n: 100 })}${pair(100, 0)}${shares}commit;`);
    const before = snapshot(db);
    assert.throws(() => db.sql(`begin;${source}commit;`), /allocations do not match/);
    assert.equal(snapshot(db), before);
    assert.equal(
      db.sql("select count(*) from pg_trigger where tgname like 'nest_%consistent_%'"),
      "0",
    );
    assert.equal(
      db.sql("select count(*) from pg_proc where proname='nest_require_financial_allocations'"),
      "0",
    );
  }
});

test("missing, partial, wrong-total and wrong-delta expenses are refused atomically", (t) => {
  const db = fixture(t);
  const before = snapshot(db);
  const variants = [
    pair(110),
    allocation(110, 1, 1) + pair(110),
    allocation(110, 1, 0) + allocation(110, 2, 1) + pair(110),
    allocation(110, 1, 2) + allocation(110, 2, 1) + pair(110),
    allocation(110, 1, 1) + allocation(110, 2, 1) + pair(110, 0),
    allocation(110, 1, 1) + allocation(110, 2, 1) + pair(110, -1),
  ];
  for (const rows of variants) {
    assert.throws(
      () => db.sql(`begin;${event({ n: 110 })}${rows}commit;`),
      /allocations do not match/,
    );
    assert.equal(snapshot(db), before);
  }
});

test("valid allocations can be assembled across statements; early constraint checks refuse partial state", (t) => {
  const db = fixture(t);
  db.sql(
    `begin;${event({ n: 120 })}${allocation(120, 1, 1)}${pair(120)}${allocation(120, 2, 1)}commit;`,
  );
  assert.equal(db.sql("select count(*) from public.financial_allocations"), "2");
  const before = snapshot(db);
  assert.throws(
    () => db.sql(`begin;${event({ n: 121 })}${pair(121)}set constraints all immediate;commit;`),
    /allocations do not match/,
  );
  assert.equal(snapshot(db), before);
});

test("expense, replacement and refund arithmetic holds for both payers and safe-integer boundaries", (t) => {
  const db = fixture(t);
  db.sql(`begin;${complete({ n: 100, amount: Number.MAX_SAFE_INTEGER, firstShare: 0 })}commit;`);
  const amounts = [0, 1, 2, Number.MAX_SAFE_INTEGER];
  for (let n = 0; n < 128; n++) amounts.push((n * 7919) % 10001);
  const cases = amounts.flatMap((amount, n) =>
    [1, 2].flatMap((payer) =>
      ["expense", "replacement", "refund"].map((type) => ({
        n: 1000 + n * 6 + (payer - 1) * 3 + ["expense", "replacement", "refund"].indexOf(type),
        amount,
        payer,
        type,
        firstShare: Math.floor(amount / 2),
        related: type === "expense" ? null : 100,
      })),
    ),
  );
  for (let start = 0; start < cases.length; start += 32) {
    db.sql(
      `begin;${cases
        .slice(start, start + 32)
        .map(complete)
        .join("\n")}commit;`,
    );
  }
  assert.equal(db.sql("select count(*) from public.financial_events"), String(cases.length + 1));
  assert.equal(db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});

test("refund direction and replacement allocation mismatches remain refused", (t) => {
  const db = fixture(t);
  db.sql(`begin;${complete({ n: 100 })}commit;`);
  const before = snapshot(db);
  for (const type of ["refund", "replacement"]) {
    const delta = type === "refund" ? 1 : -1;
    assert.throws(
      () =>
        db.sql(`begin;${event({ n: 140, type, related: 100 })}
      ${allocation(140, 1, 1)}${allocation(140, 2, 1)}${pair(140, delta)}commit;`),
      /allocations do not match/,
    );
    assert.equal(snapshot(db), before);
  }
});

test("private trigger helpers grant no client execution and trusted writes obey the same invariant", (t) => {
  const db = fixture(t);
  for (const name of [
    "nest_require_financial_allocations(uuid)",
    "nest_check_financial_allocations()",
  ]) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(
        db.sql(`select has_function_privilege('${role}','private.${name}','EXECUTE')`),
        "f",
      );
    }
  }
  db.sql(
    "grant select,insert on public.financial_events,public.ledger_entries,public.financial_allocations to service_role",
  );
  const before = snapshot(db);
  assert.throws(
    () => db.sql(`begin;set local role service_role;${event({ n: 150 })}${pair(150)}commit;`),
    /allocations do not match/,
  );
  assert.equal(snapshot(db), before);
  db.sql(`begin;set local role service_role;${complete({ n: 151 })}commit;`);
  assert.equal(db.sql("select count(*) from public.financial_events"), "1");
  for (const actor of [1, 2, 3]) {
    assert.throws(
      () => db.sql(as(actor, `select private.nest_require_financial_allocations('${id(151)}')`)),
      /permission denied/,
    );
    assert.throws(() => db.sql(as(actor, complete({ n: 152 }))), /permission denied/);
  }
});

test("real native expense command and six concurrent retries preserve one consistent expense", async (t) => {
  const db = fixture(t);
  native(db);
  const input = payload();
  const values = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(as(1, save(160, input)))),
  );
  assert.equal(new Set(values.map((v) => JSON.parse(v.stdout.trim()).eventId)).size, 1);
  assert.equal(db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(db.sql("select count(*) from public.financial_allocations"), "2");
  assert.equal(db.sql("select count(*) from public.ledger_entries"), "2");
  const before = snapshot(db);
  assert.throws(() => db.sql(as(3, save(161, input))), /Not authorized/);
  assert.equal(snapshot(db), before);
});

test("AI posting still needs exact approved payload; valid approval preserves consistent allocations", (t) => {
  const db = fixture(t);
  native(db);
  const input = payload();
  assert.throws(() => db.sql(as(1, execute(170, null))), /approval/i);
  const approval = propose(db, 170, input);
  const before = snapshot(db);
  assert.throws(() => db.sql(as(1, execute(170, approval))), /approved|approval/i);
  assert.equal(snapshot(db), before);
  decide(db, 170, approval);
  assert.throws(
    () => db.sql(as(1, execute(170, approval, payload({ note: "Changed" })))),
    /approval|payload|not approved/i,
  );
  assert.equal(snapshot(db), before);
  db.sql(as(1, execute(170, approval)));
  assert.equal(db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(db.sql("select count(*) from public.financial_allocations"), "2");
});
