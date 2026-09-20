import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/approval-fixture.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260920054303_native_private_memory.sql",
  "supabase/migrations/20260920055247_native_memory_confirmation.sql",
])
  db.file(file);
beforeEach(() =>
  db.sql("delete from public.nest_memories; delete from public.nest_memory_receipts"),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let sequence = 100;
function propose(expectedRevision = "0", memoryId = id(sequence++)) {
  const operation = id(sequence++),
    payload = { memoryId, expectedRevision, content: "Morning preference" };
  const approval = db.sql(
    as(
      `select public.nest_propose_action('${id(10)}','${operation}','memory.save',1,${json(payload)})`,
    ),
  );
  return { operation, approval, payload };
}
const decide = (r, approved = true) =>
  `select public.nest_decide_memory('${id(10)}','${r.operation}','${r.payload.memoryId}',${r.payload.expectedRevision},'${r.payload.content}','${r.approval}',${approved})`;
const execute = (r, approved) => JSON.parse(db.sql(as(decide(r, approved))));
const status = (r) =>
  db.sql(`select status from public.nest_action_approvals where id='${r.approval}'`);

test("native confirmation atomically approves, consumes and saves, with immutable replay after expiration", () => {
  const r = propose();
  assert.equal(db.sql("select count(*) from public.nest_memories"), "0");
  assert.equal(status(r), "pending");
  const result = execute(r);
  assert.equal(result.status, "consumed");
  assert.equal(result.receipt.revision, "1");
  assert.equal(status(r), "consumed");
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${r.approval}'`,
  );
  assert.deepEqual(execute(r), result);
  assert.equal(db.sql("select count(*) from public.nest_memory_receipts"), "1");
});

test("save conflicts and receipt failures roll back the native approval decision", () => {
  const r = propose();
  execute(r);
  const stale = propose("0", r.payload.memoryId);
  assert.throws(() => execute(stale), /Memory changed/);
  assert.equal(status(stale), "pending");
  assert.deepEqual(execute(stale, false), { status: "denied" });
  const edit = propose("1", r.payload.memoryId);
  db.sql(
    "create function private.fixture_fail_confirmation() returns trigger language plpgsql as $$ begin raise exception 'fixture confirmation failure'; end $$; create trigger fixture_confirmation before insert on public.nest_memory_receipts for each row execute function private.fixture_fail_confirmation()",
  );
  try {
    assert.throws(() => execute(edit), /fixture confirmation failure/);
  } finally {
    db.sql(
      "drop trigger fixture_confirmation on public.nest_memory_receipts; drop function private.fixture_fail_confirmation()",
    );
  }
  assert.equal(status(edit), "pending");
  assert.equal(db.sql("select revision from public.nest_memories"), "1");
});

test("denial is immutable and replays after expiration; expired pending confirmation remains pending", () => {
  const r = propose();
  assert.deepEqual(execute(r, false), { status: "denied" });
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${r.approval}'`,
  );
  assert.deepEqual(execute(r, false), { status: "denied" });
  assert.throws(() => execute(r), /changed or expired/);
  const expired = propose();
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired.approval}'`,
  );
  assert.throws(() => execute(expired), /changed or expired/);
  assert.equal(status(expired), "pending");
  assert.equal(db.sql("select count(*) from public.nest_memories"), "0");
});

test("native decision refuses partner access, changed text or identities and null consent", () => {
  const r = propose();
  for (const actor of [id(2), id(3)])
    for (const approved of [true, false])
      assert.throws(() => db.sql(as(decide(r, approved), actor)), /Not authorized/);
  for (const patch of [{ memoryId: id(999) }, { content: "Altered" }, { expectedRevision: "1" }])
    assert.throws(() => execute({ ...r, payload: { ...r.payload, ...patch } }), /approval changed/);
  assert.throws(() => execute({ ...r, operation: id(998) }), /approval changed/);
  assert.throws(() => db.sql(as(decide(r, "null"))), /Invalid memory decision/);
  assert.throws(() => db.sql(`set role anon; ${decide(r)}`), /permission denied/);
  assert.equal(status(r), "pending");
  assert.equal(db.sql("select count(*) from public.nest_memories"), "0");
});

test("concurrent confirm and deny cannot both succeed or leave a partial memory write", async () => {
  const r = propose();
  const results = await Promise.allSettled([
    db.concurrent(as(decide(r, true))),
    db.concurrent(as(decide(r, false))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const consumed = status(r) === "consumed";
  assert.equal(db.sql("select count(*) from public.nest_memories"), consumed ? "1" : "0");
  assert.equal(db.sql("select count(*) from public.nest_memory_receipts"), consumed ? "1" : "0");
});
