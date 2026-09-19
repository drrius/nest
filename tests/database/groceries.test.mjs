import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/grocery-fixture.sql");
db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 100;
const next = () => id(sequence++);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub = '${user}'; ${sql}`;
const item = (state = "active") => {
  const target = next();
  db.sql(
    `insert into public.grocery_items(id,household_id,name,state) values('${target}','${household}','Milk','${state}')`,
  );
  return target;
};
const request = (target, options = {}) => ({
  target,
  operation: next(),
  expected: "1",
  checked: true,
  ...options,
});
const sql = (r) =>
  `select public.nest_set_grocery_checked('${r.household ?? household}','${r.operation}','${r.target}',${r.expected},${r.checked})`;
const apply = (user, r) => JSON.parse(db.sql(as(user, sql(r))));
const row = (target) =>
  JSON.parse(db.sql(`select row_to_json(g) from public.grocery_items g where id='${target}'`));

test("lost acknowledgment returns the original receipt without a second version transition", () => {
  const target = item(),
    r = request(target);
  const first = apply(actor, r);
  assert.equal(first.version, "2");
  assert.deepEqual(apply(actor, r), first);
  assert.equal(row(target).native_version, 2);
  assert.equal(row(target).state, "active");
  assert.equal(row(target).purchased_at, null);
});

test("same-state partner checks converge without another write", () => {
  const target = item();
  apply(actor, request(target));
  const second = apply(partner, request(target));
  assert.equal(second.outcome, "already_applied");
  assert.equal(second.checked, true);
  assert.equal(second.version, "2");
});

test("stale opposite intents conflict instead of using device time", () => {
  const target = item();
  apply(actor, request(target));
  assert.throws(() => apply(partner, request(target, { checked: false })), /Grocery item changed/);
  const unchecked = apply(partner, request(target, { checked: false, expected: "2" }));
  assert.equal(unchecked.version, "3");
  assert.throws(() => apply(actor, request(target)), /Grocery item changed/);
  assert.equal(row(target).native_checked, false);
});

test("operation reuse cannot change target, version or checked value", () => {
  const r = request(item());
  apply(actor, r);
  for (const changes of [{ target: item() }, { expected: "2" }, { checked: false }]) {
    assert.throws(() => apply(actor, { ...r, ...changes }), /Operation payload changed/);
  }
});

test("removed, purchased and missing items cannot be resurrected", () => {
  for (const target of [item("removed"), item("purchased"), next()]) {
    assert.throws(() => apply(actor, request(target)), /Grocery item unavailable/);
  }
});

test("legacy description edits invalidate check versions while preserving column permissions", () => {
  const target = item();
  db.sql(as(actor, `update public.grocery_items set name='Oat milk' where id='${target}'`));
  assert.equal(row(target).native_version, 2);
  assert.throws(() => apply(actor, request(target)), /Grocery item changed/);
  assert.throws(
    () =>
      db.sql(as(actor, `update public.grocery_items set native_checked=true where id='${target}'`)),
    /permission denied/,
  );
});

test("tenant isolation covers item reads, mutation and owner-only operation receipts", () => {
  const target = item(),
    r = request(target);
  apply(actor, r);
  assert.equal(
    db.sql(as(outsider, `select count(*) from public.grocery_items where id='${target}'`)),
    "0",
  );
  assert.throws(() => apply(outsider, request(target)), /Not authorized/);
  assert.throws(
    () => apply(outsider, request(target, { household: id(20) })),
    /Grocery item unavailable/,
  );
  for (const user of [partner, outsider]) {
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_grocery_check_receipts where operation_id='${r.operation}'`,
        ),
      ),
      "0",
    );
  }
  assert.throws(() => db.sql(`set role anon; ${sql(r)}`), /permission denied/);
});

test("receipt failure rolls back the checked state and version", () => {
  const target = item();
  db.sql(`create function private.fixture_receipt_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture receipt failure'; end; $$;
    create trigger fail_receipt before insert on public.nest_grocery_check_receipts
    for each row execute function private.fixture_receipt_failure()`);
  assert.throws(() => apply(actor, request(target)), /Fixture receipt failure/);
  assert.equal(row(target).native_checked, false);
  assert.equal(row(target).native_version, 1);
  db.sql("drop trigger fail_receipt on public.nest_grocery_check_receipts");
});

test("concurrent duplicate operations and partner checks commit a single state transition", async () => {
  const target = item(),
    r = request(target);
  await Promise.all([
    db.concurrent(as(actor, sql(r))),
    db.concurrent(as(actor, sql(r))),
    db.concurrent(as(partner, sql(request(target)))),
  ]);
  assert.equal(row(target).native_checked, true);
  assert.equal(row(target).native_version, 2);
});

test("claimed items can be checked without finishing or detaching their legacy shopping session", () => {
  const target = item("claimed"),
    session = next();
  db.sql(`update public.grocery_items set claimed_by_session_id='${session}' where id='${target}'`);
  apply(actor, request(target, { expected: "2" }));
  assert.equal(row(target).claimed_by_session_id, session);
  assert.equal(row(target).state, "claimed");
  assert.equal(row(target).purchased_at, null);
});

test("membership revocation prevents even replaying an existing receipt", () => {
  const r = request(item());
  apply(actor, r);
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.throws(() => apply(actor, r), /Not authorized/);
  assert.equal(db.sql(as(actor, "select count(*) from public.nest_grocery_check_receipts")), "0");
  db.sql(`insert into public.household_members values('${household}','${actor}')`);
});

test("invalid parameters and direct internal-helper execution are rejected", () => {
  const target = item();
  assert.throws(() => apply(actor, request(target, { expected: "0" })), /Invalid check request/);
  assert.throws(() => apply(actor, request(target, { checked: null })), /Invalid check request/);
  assert.throws(
    () =>
      db.sql(
        as(actor, `select private.nest_apply_grocery_check('${household}','${target}',1,true)`),
      ),
    /permission denied/,
  );
  assert.equal(row(target).native_version, 1);
});
