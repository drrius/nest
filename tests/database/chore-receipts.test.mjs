import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

let db;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asMember = (actor, sql) =>
  `begin; set local role authenticated; set local request.jwt.claim.sub='${id(actor)}'; ${sql}; commit;`;
const complete = (occurrence, op, due = "2026-09-19") =>
  `select public.nest_complete_chore('${id(occurrence)}','${id(op)}','${due}','2026-09-19')`;
const result = (output) => JSON.parse(output.split("\n").find((line) => line.startsWith("{")));

before(() => {
  db = startFixturePostgres();
  db.file("tests/database/legacy-chore-fixture.sql");
  db.file("supabase/migrations/20260919205503_native_chore_receipts.sql");
});
after(() => db?.stop());

test("completion and its receipt commit once; a lost-ack retry returns the original result", () => {
  const first = result(db.sql(asMember(1, complete(100, 500))));
  const retry = result(db.sql(asMember(1, complete(100, 500))));
  assert.deepEqual(retry, first);
  assert.equal(first.outcome, "completed");
  assert.equal(first.completedBy, id(1));
  assert.equal(db.sql("select count(*) from private.fixture_closure_calls"), "1");
});

test("reuse of an operation ID for changed payload fails without another closure", () => {
  assert.throws(() => db.sql(asMember(1, complete(101, 500))), /operation_conflict/);
  assert.equal(
    db.sql(`select status from public.routine_occurrences where id='${id(101)}'`),
    "open",
  );
});

test("partner acknowledgment preserves the actual completer and creates no second completion", () => {
  const partner = result(db.sql(asMember(2, complete(100, 501))));
  assert.equal(partner.outcome, "already_completed");
  assert.equal(partner.completedBy, id(1));
  assert.equal(db.sql("select count(*) from private.fixture_closure_calls"), "1");
});

test("RLS exposes only the actor's receipts and rejects direct writes", () => {
  assert.equal(db.sql(asMember(1, "select count(*) from public.nest_chore_receipts")), "1");
  assert.equal(db.sql(asMember(2, "select count(*) from public.nest_chore_receipts")), "1");
  assert.equal(db.sql(asMember(3, "select count(*) from public.nest_chore_receipts")), "0");
  assert.throws(
    () => db.sql(asMember(1, "delete from public.nest_chore_receipts")),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(asMember(1, "update public.nest_chore_receipts set result='{}'")),
    /permission denied/,
  );
});

test("anonymous, unaffiliated and other-tenant callers cannot complete or inspect household rows", () => {
  assert.throws(() => db.sql(`set role anon; ${complete(101, 502)}`), /permission denied/);
  assert.throws(() => db.sql(asMember(3, complete(101, 502))), /not_found/);
  assert.throws(() => db.sql(asMember(4, complete(101, 502))), /not_found/);
  assert.equal(db.sql(asMember(3, "select count(*) from public.routine_occurrences")), "0");
});

test("rescheduled and skipped occurrences conflict without receipts or closure", () => {
  assert.throws(() => db.sql(asMember(1, complete(101, 503, "2026-09-18"))), /occurrence_conflict/);
  db.sql(`update public.routine_occurrences set status='skipped',role=null where id='${id(102)}'`);
  assert.throws(() => db.sql(asMember(1, complete(102, 504))), /occurrence_conflict/);
  assert.equal(db.sql("select count(*) from public.nest_chore_receipts"), "2");
});

test("concurrent partner completion serializes to one closure and an honest acknowledgment", async () => {
  const responses = await Promise.all([
    db.concurrent(asMember(1, complete(103, 505))),
    db.concurrent(asMember(2, complete(103, 506))),
  ]);
  const values = responses.map((response) => result(response.stdout));
  assert.deepEqual(
    values.map((value) => value.outcome).sort((a, b) => a.localeCompare(b)),
    ["already_completed", "completed"],
  );
  assert.equal(values[0].completedBy, values[1].completedBy);
  assert.equal(
    db.sql(`select count(*) from private.fixture_closure_calls where occurrence_id='${id(103)}'`),
    "1",
  );
});

test("receipt storage failure rolls back the legacy closure and completion", () => {
  db.sql(
    `alter table public.nest_chore_receipts add constraint fixture_fail check(operation_id <> '${id(507)}')`,
  );
  assert.throws(() => db.sql(asMember(1, complete(104, 507))), /fixture_fail/);
  assert.equal(
    db.sql(`select status from public.routine_occurrences where id='${id(104)}'`),
    "open",
  );
  assert.equal(
    db.sql(`select count(*) from private.fixture_closure_calls where occurrence_id='${id(104)}'`),
    "0",
  );
  db.sql("alter table public.nest_chore_receipts drop constraint fixture_fail");
});

test("concurrent duplicate requests return exactly the same receipt", async () => {
  const outputs = await Promise.all([
    db.concurrent(asMember(1, complete(105, 508))),
    db.concurrent(asMember(1, complete(105, 508))),
  ]);
  assert.deepEqual(result(outputs[0].stdout), result(outputs[1].stdout));
  assert.equal(
    db.sql(`select count(*) from private.fixture_closure_calls where occurrence_id='${id(105)}'`),
    "1",
  );
});

test("null and non-finite dates cannot create closure or receipts", () => {
  for (const date of ["null", "'infinity'", "'-infinity'"]) {
    const sql = `select public.nest_complete_chore('${id(106)}','${id(509)}','2026-09-19',${date})`;
    assert.throws(() => db.sql(asMember(1, sql)), /invalid_request/);
  }
  assert.equal(
    db.sql(`select status from public.routine_occurrences where id='${id(106)}'`),
    "open",
  );
});
