import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/approval-fixture.sql");
db.file("supabase/migrations/20260919213407_native_action_approvals.sql");
db.file("tests/database/approval-write-fixture.sql");
db.file("supabase/migrations/20260928092000_native_financial_approval_expiry.sql");
db.file("supabase/migrations/20260928100000_native_recurring_approval_expiry.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  household = id(10);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
let sequence = 700;
function proposal() {
  const operation = id(sequence++);
  const approval = db.sql(
    as(
      actor,
      `select public.nest_propose_action('${household}','${operation}','expenses.record',1,'{}')`,
    ),
  );
  return { operation, approval };
}
const query = (p) =>
  `select public.nest_financial_approval_expiry('${household}','${p.approval}','${p.operation}','expenses.record')`;
const expire = (p) =>
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${p.approval}'`,
  );
test("expiry attestation binds owner and exact operation without deciding the proposal", () => {
  const p = proposal();
  assert.equal(JSON.parse(db.sql(as(actor, query(p)))).expiredUnused, false);
  expire(p);
  for (const user of [id(2), id(3)])
    assert.throws(() => db.sql(as(user, query(p))), /Not authorized/);
  assert.throws(() => db.sql(as(actor, query({ ...p, operation: id(999) }))), /identity changed/);
  const result = JSON.parse(db.sql(as(actor, query(p))));
  assert.equal(result.expiredUnused, true);
  assert.equal(result.actorId, actor);
  assert.equal(result.approvalId, p.approval);
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${p.approval}'`),
    "pending",
  );
});
test("consumed approvals never authorize discarding a recorded result", () => {
  const p = proposal();
  db.sql(
    as(
      actor,
      `select public.nest_decide_action('${p.approval}','${p.operation}','expenses.record',1,'{}',true);
    select public.fixture_execute('${p.approval}','${household}','${p.operation}','expenses.record',1,'{}',false)`,
    ),
  );
  expire(p);
  assert.equal(JSON.parse(db.sql(as(actor, query(p)))).expiredUnused, false);
});

test("expiry waits for an in-flight consumption before attesting unused", async () => {
  const p = proposal();
  expire(p);
  // Fixture-only time adjustment makes the old visible row expired while a
  // successful consumption is uncommitted. A nonlocking read would be unsafe.
  const writer = db.concurrent(`begin;
    set application_name='nest-expiry-writer';
    update public.nest_action_approvals set expires_at=now()+interval '1 minute' where id='${p.approval}';
    ${as(
      actor,
      `select public.nest_decide_action('${p.approval}','${p.operation}','expenses.record',1,'{}',true);
    select public.fixture_execute('${p.approval}','${household}','${p.operation}','expenses.record',1,'{}',false);`,
    )}
    select pg_sleep(1); commit;`);
  let observed = false;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      observed =
        db.sql(
          "select exists(select 1 from pg_stat_activity where application_name='nest-expiry-writer' and wait_event='PgSleep')",
        ) === "t";
      if (observed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(observed, true, "writer must hold its uncommitted consumption");
    const result = await db.concurrent(as(actor, query(p)));
    assert.equal(JSON.parse(result.stdout).expiredUnused, false);
  } finally {
    await writer;
  }
  assert.equal(
    db.sql(`select count(*) from private.fixture_writes where invocation_id='${p.operation}'`),
    "1",
  );
});

test("recurring create and update expiry remain owner and command bound", () => {
  for (const command of ["recurring.create", "recurring.update"]) {
    const operation = id(sequence++);
    const approval = db.sql(
      as(
        actor,
        `select public.nest_propose_action('${household}','${operation}','${command}',1,'{}')`,
      ),
    );
    const p = { operation, approval };
    expire(p);
    const sql = query(p).replace("expenses.record", command);
    assert.equal(JSON.parse(db.sql(as(actor, sql))).expiredUnused, true);
    assert.throws(() => db.sql(as(id(2), sql)), /Not authorized/);
    assert.throws(() => db.sql(as(actor, query(p))), /identity changed/);
  }
});
