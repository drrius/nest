import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/routine-creation-fixture.sql");
db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
db.file("supabase/migrations/20260928104000_native_routine_creation_cancellation.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = {
  title: "Clean",
  schedule: { kind: "daily" },
  assignment: { policy: "shared" },
};
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
const query = (kind, operation, value = definition) =>
  `select public.nest_${kind}('${id(10)}','${id(operation)}','${JSON.stringify(value)}'::jsonb)`;
const cancel = (operation, actor = 1) =>
  JSON.parse(db.sql(as(actor, query("cancel_routine_creation", operation))));
test("cancelled requests cannot later create and cancellation is actor-bound", () => {
  const result = cancel(100);
  assert.equal(result.status, "cancelled");
  assert.equal(result.actorId, id(1));
  assert.equal(result.receipt, null);
  assert.deepEqual(cancel(100), result);
  assert.throws(() => db.sql(as(1, query("create_routine", 100))), /creation cancelled/);
  assert.throws(
    () => db.sql(as(1, query("cancel_routine_creation", 100, { ...definition, title: "Other" }))),
    /operation changed/,
  );
  assert.throws(() => cancel(100, 3), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; ${query("cancel_routine_creation", 100)}`),
    /permission denied/,
  );
  const other = JSON.parse(db.sql(as(2, query("create_routine", 100))));
  assert.equal(other.actorId, id(2));
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `select private.nest_create_routine_before_cancellation('${id(10)}','${id(100)}','{}')`,
        ),
      ),
    /permission denied/,
  );
});
test("cancel after committed create returns original receipt without deleting the routine", () => {
  const created = JSON.parse(db.sql(as(1, query("create_routine", 101))));
  const result = cancel(101);
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt, created);
  assert.equal(db.sql(`select count(*) from public.routines where id='${created.routineId}'`), "1");
  assert.deepEqual(cancel(101), result);
});
test("cancellation waits for in-flight creation and reports recorded", async () => {
  const writer = db.concurrent(
    `set application_name='nest-create-cancel-writer'; begin; ${as(1, query("create_routine", 102))}; select pg_sleep(1); commit;`,
  );
  try {
    let observed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      observed =
        db.sql(
          "select exists(select 1 from pg_stat_activity where application_name='nest-create-cancel-writer' and wait_event='PgSleep')",
        ) === "t";
      if (observed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(observed, true);
    const result = await db.concurrent(as(1, query("cancel_routine_creation", 102)));
    assert.equal(JSON.parse(result.stdout).status, "recorded");
  } finally {
    await writer;
  }
});

test("creation waits for in-flight cancellation and cannot resurrect it", async () => {
  const writer = db.concurrent(
    `set application_name='nest-cancel-create-writer'; begin; ${as(1, query("cancel_routine_creation", 103))}; select pg_sleep(1); commit;`,
  );
  try {
    let observed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      observed =
        db.sql(
          "select exists(select 1 from pg_stat_activity where application_name='nest-cancel-create-writer' and wait_event='PgSleep')",
        ) === "t";
      if (observed) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(observed, true);
    await assert.rejects(db.concurrent(as(1, query("create_routine", 103))), /creation cancelled/);
  } finally {
    await writer;
  }
  assert.equal(
    db.sql(
      `select count(*) from public.nest_routine_creation_receipts where actor_id='${id(1)}' and operation_id='${id(103)}'`,
    ),
    "0",
  );
});
