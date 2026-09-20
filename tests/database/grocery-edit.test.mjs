import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/grocery-edit-fixture.sql");
db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
db.file("supabase/migrations/20260920002735_native_grocery_commands.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 100;
const next = () => id(sequence++);
const quote = (value) => (value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
const request = (changes = {}) => ({
  household,
  operation: next(),
  action: "add",
  target: next(),
  expected: null,
  name: "Milk",
  quantity: "2",
  unit: "litres",
  category: null,
  ...changes,
});
const sql = (r) =>
  `select public.nest_edit_grocery(${[
    r.household,
    r.operation,
    r.action,
    r.target,
    r.expected,
    r.name,
    r.quantity,
    r.unit,
    r.category,
  ]
    .map(quote)
    .join(",")})`;
const apply = (r, user = actor) => JSON.parse(db.sql(as(user, sql(r))));
const row = (target) =>
  JSON.parse(db.sql(`select row_to_json(g) from public.grocery_items g where id=${quote(target)}`));
const change = (r, changes = {}) =>
  request({ target: r.target, action: "edit", expected: "1", ...changes });
const remove = (r, expected = "1") =>
  change(r, { action: "remove", expected, name: null, quantity: null, unit: null });
const check = (r, checked = true, expected = "1") =>
  db.sql(
    as(
      actor,
      `select public.nest_set_grocery_checked('${household}','${next()}','${r.target}',${expected},${checked})`,
    ),
  );

test("lost add/edit/remove responses replay immutable receipts and preserve identifiers", () => {
  const r = request();
  const first = apply(r);
  assert.equal(first.version, "1");
  assert.deepEqual(apply(r), first);
  assert.equal(row(r.target).quantity, "2");
  const edit = change(r, { name: "Oat milk", category: id(30) });
  const updated = apply(edit);
  assert.equal(updated.version, "2");
  assert.deepEqual(apply(edit), updated);
  const deletion = remove(r, "2");
  const removed = apply(deletion);
  assert.equal(removed.removed, true);
  assert.equal(removed.version, "3");
  assert.deepEqual(apply(deletion), removed);
  assert.deepEqual(apply(r), first);
  assert.equal(row(r.target).name, "Oat milk");
  assert.equal(row(r.target).state, "removed");
});

test("receipt identities reject changed commands and cannot overwrite existing targets", () => {
  const r = request();
  apply(r);
  for (const patch of [
    { name: "Eggs" },
    { quantity: "3" },
    { unit: "bottles" },
    { category: id(30) },
    { target: next() },
    { action: "edit", expected: "1" },
  ]) {
    assert.throws(() => apply({ ...r, ...patch }), /Operation payload changed/);
  }
  assert.throws(() => apply({ ...r, operation: next() }), /identity already exists/);
  assert.equal(row(r.target).native_version, 1);
});

test("check/edit races reject stale forms without resetting checked state", () => {
  const r = request();
  apply(r);
  check(r);
  assert.throws(() => apply(change(r)), /Grocery item changed/);
  assert.equal(apply(change(r, { expected: "2", name: "Skim milk" })).version, "3");
  assert.equal(row(r.target).native_checked, true);
  assert.throws(() => check(r, false, "2"), /Grocery item changed/);
  assert.throws(() => apply(remove(r, "2")), /Grocery item changed/);
});

test("concurrent partner edits allow one exact-version writer", async () => {
  const r = request();
  apply(r);
  const results = await Promise.allSettled([
    db.concurrent(as(actor, sql(change(r, { name: "A" })))),
    db.concurrent(as(partner, sql(change(r, { name: "B" })))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    results.find((result) => result.status === "rejected").reason.message,
    /Grocery item changed/,
  );
  assert.equal(row(r.target).native_version, 2);
});

test("concurrent duplicate adds create one item and one receipt", async () => {
  const r = request();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => db.concurrent(as(actor, sql(r)))),
  );
  assert.ok(results.every((result) => result.stdout === results[0].stdout));
  assert.equal(
    db.sql(
      `select count(*) from public.nest_grocery_edit_receipts where operation_id='${r.operation}'`,
    ),
    "1",
  );
  assert.equal(row(r.target).native_version, 1);
});

test("tenant isolation covers category selection, mutation and receipt visibility", () => {
  const r = request();
  apply(r);
  assert.throws(() => apply(change(r), outsider), /Not authorized/);
  assert.throws(
    () => apply(change(r, { household: id(20) }), outsider),
    /Grocery item unavailable/,
  );
  for (const category of [id(31), id(32), next()]) {
    assert.throws(() => apply(change(r, { category })), /Category unavailable/);
  }
  for (const user of [partner, outsider])
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_grocery_edit_receipts where operation_id='${r.operation}'`,
        ),
      ),
      "0",
    );
  assert.throws(() => db.sql(`set role anon; ${sql(r)}`), /permission denied/);
  assert.equal(row(r.target).native_version, 1);
});

test("invalid direct RPC fields never create records or normalize retry payloads silently", () => {
  for (const patch of [
    { action: null },
    { action: "purchase" },
    { name: null },
    { name: " " },
    { name: "a".repeat(121) },
    { quantity: "a".repeat(81) },
    { unit: "a".repeat(81) },
    { expected: "1" },
    { operation: null },
    { target: null },
  ]) {
    assert.throws(() => apply(request(patch)), /Invalid|Missing/);
  }
  const r = request();
  apply(r);
  assert.throws(() => apply(change(r, { expected: null })), /Invalid grocery version/);
  assert.throws(() => apply({ ...remove(r), name: "Hidden edit" }), /Removal cannot edit/);
});

test("terminal and missing rows cannot be edited or revived", () => {
  const r = request();
  apply(r);
  apply(remove(r));
  assert.throws(() => apply(change(r, { expected: "2" })), /Grocery item unavailable/);
  assert.throws(() => apply(change(request())), /Grocery item unavailable/);
  const purchased = request();
  apply(purchased);
  db.sql(
    `update public.grocery_items set state='purchased',purchased_at=now() where id='${purchased.target}'`,
  );
  assert.throws(() => apply(remove(purchased, "2")), /Grocery item unavailable/);
  assert.equal(row(purchased.target).state, "purchased");
});

test("legacy claims and meal/history metadata survive edits; removal requires reconciliation", () => {
  const r = request();
  apply(r);
  const session = next(),
    meal = next();
  db.sql(`update public.grocery_items set state='claimed',claimed_by_session_id='${session}',
    note='Legacy note',originating_meal_plan_entry_id='${meal}' where id='${r.target}'`);
  apply(change(r, { expected: "2", name: "Rice" }));
  const stored = row(r.target);
  assert.equal(stored.state, "claimed");
  assert.equal(stored.claimed_by_session_id, session);
  assert.equal(stored.note, "Legacy note");
  assert.equal(stored.originating_meal_plan_entry_id, meal);
  assert.equal(stored.purchased_at, null);
  assert.throws(() => apply(remove(r, "3")), /requires reconciliation/);
  assert.equal(row(r.target).native_version, 3);
});

test("receipt failure rolls back the command and membership loss prevents replay", () => {
  const r = request();
  apply(r);
  db.sql(`create function private.fixture_edit_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture edit failure'; end; $$;
    create trigger fail_edit before insert on public.nest_grocery_edit_receipts
      for each row execute function private.fixture_edit_failure()`);
  assert.throws(() => apply(change(r)), /Fixture edit failure/);
  assert.equal(row(r.target).native_version, 1);
  db.sql("drop trigger fail_edit on public.nest_grocery_edit_receipts");
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.throws(() => apply(r), /Not authorized/);
  assert.equal(db.sql(as(actor, "select count(*) from public.nest_grocery_edit_receipts")), "0");
  db.sql(`insert into public.household_members values('${household}','${actor}')`);
});

test("internal helpers and receipt writes are unavailable to authenticated clients", () => {
  assert.throws(
    () =>
      db.sql(
        as(
          actor,
          `select private.nest_apply_grocery_edit('${household}',
    'add','${next()}',null,'Milk',null,null,null)`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        as(actor, "select private.nest_validate_grocery_edit('add',null,'Milk',null,null,null)"),
      ),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as(actor, "delete from public.nest_grocery_edit_receipts")),
    /permission denied/,
  );
});
