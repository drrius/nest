import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/approval-fixture.sql");
db.file("supabase/migrations/20260919213407_native_action_approvals.sql");
db.file("tests/database/approval-write-fixture.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 100;
const payload = `'${JSON.stringify({ amount: 101, payer: actor, split: [51, 50] })}'::jsonb`;
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub = '${user}'; ${sql}`;
const propose = () => {
  const invocation = id(sequence++);
  const approval = db.sql(
    as(
      actor,
      `select public.nest_propose_action('${household}','${invocation}','expenses.record',1,${payload})`,
    ),
  );
  return { invocation, approval };
};
const decide = (request, approved = true) =>
  `select public.nest_decide_action('${request.approval}','${request.invocation}','expenses.record',1,${payload},${approved})`;
const execute = (
  request,
  options = {},
) => `select public.fixture_execute('${request.approval}','${options.household ?? household}',
  '${options.invocation ?? request.invocation}','${options.command ?? "expenses.record"}',${options.version ?? 1},${options.payload ?? payload},${options.fail ?? false})`;
const status = (request) =>
  db.sql(`select status from public.nest_action_approvals where id='${request.approval}'`);

test("only the originating member can read or decide the approval; direct writes are denied", () => {
  const request = propose();
  for (const user of [partner, outsider]) {
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_action_approvals where id='${request.approval}'`,
        ),
      ),
      "0",
    );
    assert.throws(() => db.sql(as(user, decide(request))), /Not authorized/);
    assert.throws(() => db.sql(as(user, execute(request))), /Not authorized/);
  }
  assert.throws(
    () =>
      db.sql(
        as(
          actor,
          `update public.nest_action_approvals set status='approved' where id='${request.approval}'`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        `set role anon; select public.nest_propose_action('${household}','${id(999)}','expenses.record',1,${payload})`,
      ),
    /permission denied/,
  );
});

test("pending, denied and expired approvals cannot authorize the fixture write", () => {
  const pending = propose();
  assert.throws(() => db.sql(as(actor, execute(pending))), /Approval not valid/);
  db.sql(as(actor, decide(pending, false)));
  assert.throws(() => db.sql(as(actor, execute(pending))), /Approval not valid/);
  const expired = propose();
  db.sql(as(actor, decide(expired)));
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired.approval}'`,
  );
  assert.throws(() => db.sql(as(actor, execute(expired))), /Approval not valid/);
  assert.throws(() => db.sql(as(actor, decide(expired))), /Approval expired/);
});

test("a confirmed payload cannot be changed, redirected or upgraded at execution", () => {
  const request = propose();
  db.sql(as(actor, decide(request)));
  for (const options of [
    { version: 2 },
    { command: "settlements.record" },
    { invocation: id(999) },
    { household: id(20) },
    { payload: `'{"amount":102}'::jsonb` },
  ]) {
    assert.throws(() => db.sql(as(actor, execute(request, options))), /Approval not valid/);
  }
  assert.equal(status(request), "approved");
});

test("duplicate proposals and decisions do not extend expiry or change the approved payload", () => {
  const request = propose();
  const duplicate = `select public.nest_propose_action('${household}','${request.invocation}','expenses.record',1,${payload})`;
  const expiry = db.sql(
    `select expires_at from public.nest_action_approvals where id='${request.approval}'`,
  );
  assert.equal(db.sql(as(actor, duplicate)), request.approval);
  assert.throws(
    () => db.sql(as(actor, duplicate.replace(",1,", ",2,"))),
    /Invocation payload changed/,
  );
  db.sql(as(actor, decide(request)));
  db.sql(as(actor, decide(request)));
  assert.equal(
    db.sql(`select expires_at from public.nest_action_approvals where id='${request.approval}'`),
    expiry,
  );
  assert.throws(() => db.sql(as(actor, decide(request, false))), /no longer pending/);
});

test("consumption and write roll back together; a successful approval is consumed once", () => {
  const request = propose();
  db.sql(as(actor, decide(request)));
  assert.throws(() => db.sql(as(actor, execute(request, { fail: true }))), /Fixture write failure/);
  assert.equal(status(request), "approved");
  assert.equal(
    db.sql(
      `select count(*) from private.fixture_writes where invocation_id='${request.invocation}'`,
    ),
    "0",
  );
  db.sql(as(actor, execute(request)));
  assert.equal(status(request), "consumed");
  assert.throws(() => db.sql(as(actor, execute(request))), /Approval not valid/);
  assert.equal(
    db.sql(
      `select count(*) from private.fixture_writes where invocation_id='${request.invocation}'`,
    ),
    "1",
  );
});

test("two concurrent executions cannot both consume one approval", async () => {
  const request = propose();
  db.sql(as(actor, decide(request)));
  const results = await Promise.allSettled([
    db.concurrent(as(actor, execute(request))),
    db.concurrent(as(actor, execute(request))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    db.sql(
      `select count(*) from private.fixture_writes where invocation_id='${request.invocation}'`,
    ),
    "1",
  );
});

test("membership revocation removes access and execution rights without deleting audit history", () => {
  const request = propose();
  db.sql(as(actor, decide(request)));
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.equal(db.sql(as(actor, "select count(*) from public.nest_action_approvals")), "0");
  assert.throws(() => db.sql(as(actor, execute(request))), /Not authorized/);
  assert.equal(status(request), "approved");
  db.sql(`insert into public.household_members values('${household}','${actor}')`);
});

test("clients cannot consume approvals through the internal helper or tamper with the visible decision", () => {
  const request = propose();
  assert.throws(
    () => db.sql(as(actor, decide(request).replace(",1,", ",2,"))),
    /Approval payload changed/,
  );
  assert.throws(
    () =>
      db.sql(
        as(
          actor,
          `select private.nest_consume_action_approval('${request.approval}',
    '${household}','${request.invocation}','expenses.record',1,${payload})`,
        ),
      ),
    /permission denied/,
  );
  assert.equal(status(request), "pending");
});

test("concurrent contradictory decisions settle on one immutable outcome", async () => {
  const request = propose();
  const results = await Promise.allSettled([
    db.concurrent(as(actor, decide(request, true))),
    db.concurrent(as(actor, decide(request, false))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(["approved", "denied"].includes(status(request)));
});
