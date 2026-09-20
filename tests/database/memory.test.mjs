import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { MemoryContent } from "../../packages/contracts/src/memory.ts";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/approval-fixture.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260920054303_native_private_memory.sql",
])
  db.file(file);
beforeEach(() =>
  db.sql("delete from public.nest_memories; delete from public.nest_memory_receipts"),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const text = (value) => (value === null ? "null" : `'${value.replaceAll("'", "''")}'`);
let sequence = 100;
function proposal(overrides = {}) {
  const operation = id(sequence++),
    memoryId = id(sequence++);
  const payload = {
    memoryId,
    expectedRevision: "0",
    content: "I prefer a quiet morning",
    ...overrides,
  };
  const approval = db.sql(
    as(
      `select public.nest_propose_action('${id(10)}','${operation}','memory.save',1,${json(payload)})`,
    ),
  );
  return { operation, approval, payload };
}
const decide = (r, approved = true) =>
  `select public.nest_decide_action('${r.approval}','${r.operation}','memory.save',1,${json(r.payload)},${approved})`;
const save = (r) =>
  `select public.nest_save_memory('${id(10)}','${r.operation}','${r.payload.memoryId}',${r.payload.expectedRevision},${text(r.payload.content)},'${r.approval}')`;
const execute = (r) => JSON.parse(db.sql(as(save(r))));
function confirmed(overrides) {
  const r = proposal(overrides);
  db.sql(as(decide(r)));
  return r;
}
const remove = (r, operation = id(sequence++), revision = "1") =>
  `select public.nest_remove_memory('${id(10)}','${operation}','${r.payload.memoryId}',${revision})`;
const count = (table) => db.sql(`select count(*) from public.${table}`);
const status = (r) =>
  db.sql(`select status from public.nest_action_approvals where id='${r.approval}'`);

test("memory additions and changes require exact approved payloads; pending, denied and expired requests have no effect", () => {
  const pending = proposal();
  assert.throws(() => execute(pending), /Approval not valid/);
  db.sql(as(decide(pending, false)));
  assert.throws(() => execute(pending), /Approval not valid/);
  const expired = confirmed();
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired.approval}'`,
  );
  assert.throws(() => execute(expired), /Approval not valid/);
  assert.equal(count("nest_memories"), "0");
  const r = confirmed();
  for (const patch of [{ content: "Changed" }, { memoryId: id(900) }])
    assert.throws(
      () => execute({ ...r, payload: { ...r.payload, ...patch } }),
      /Approval not valid/,
    );
  assert.throws(() => execute({ ...r, operation: id(901) }), /Approval not valid/);
  assert.equal(execute(r).revision, "1");
  const edit = proposal({
    memoryId: r.payload.memoryId,
    expectedRevision: "1",
    content: "New preference",
  });
  assert.throws(() => execute(edit), /Approval not valid/);
  db.sql(as(decide(edit)));
  assert.equal(execute(edit).revision, "2");
  assert.equal(status(edit), "consumed");
});

test("only the owner reads memory, receipts and approval; partner, outsider and anonymous mutations fail", () => {
  const r = confirmed();
  const result = execute(r);
  assert.equal(result.actorId, id(1));
  assert.equal(result.householdId, id(10));
  for (const actor of [id(2), id(3)]) {
    for (const table of ["nest_memories", "nest_memory_receipts"])
      assert.equal(db.sql(as(`select count(*) from public.${table}`, actor)), "0");
    assert.throws(() => db.sql(as(save(r), actor)), /Not authorized|Approval not valid/);
    assert.throws(() => db.sql(as(remove(r), actor)), /Memory changed|Not authorized/);
    assert.throws(() => db.sql(as(decide(r), actor)), /Not authorized/);
  }
  assert.throws(() => db.sql(`set role anon; ${save(r)}`), /permission denied/);
  assert.throws(
    () => db.sql(as("update public.nest_memories set content='injected'")),
    /permission denied/,
  );
  assert.throws(() => db.sql(as("delete from public.nest_memory_receipts")), /permission denied/);
  assert.throws(() => db.sql(as(save(r).replace(id(10), id(20)))), /Not authorized/);
});

test("concurrent duplicate confirmed saves consume once and return an immutable receipt even after expiry", async () => {
  const r = confirmed();
  const results = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(save(r)))));
  const receipts = results.map((result) => JSON.parse(result.stdout));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  assert.equal(count("nest_memory_receipts"), "1");
  assert.equal(status(r), "consumed");
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${r.approval}'`,
  );
  assert.deepEqual(execute(r), receipts[0]);
  assert.throws(
    () => execute({ ...r, payload: { ...r.payload, content: "Different" } }),
    /operation changed/,
  );
});

test("competing approved revisions cannot overwrite each other; conflict leaves approval unconsumed", async () => {
  const r = confirmed();
  execute(r);
  const first = confirmed({
    memoryId: r.payload.memoryId,
    expectedRevision: "1",
    content: "First edit",
  });
  const second = confirmed({
    memoryId: r.payload.memoryId,
    expectedRevision: "1",
    content: "Second edit",
  });
  const results = await Promise.allSettled([
    db.concurrent(as(save(first))),
    db.concurrent(as(save(second))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    String(results.find((result) => result.status === "rejected").reason),
    /Memory changed/,
  );
  assert.deepEqual(
    [status(first), status(second)].sort((a, b) => a.localeCompare(b)),
    ["approved", "consumed"],
  );
  assert.equal(db.sql("select revision from public.nest_memories"), "2");
});

test("deletion is immediate, clears content, retries exactly, and prevents stale or new approved resurrection", () => {
  const r = confirmed();
  const saved = execute(r);
  const pendingEdit = confirmed({
    memoryId: r.payload.memoryId,
    expectedRevision: "1",
    content: "Must not return",
  });
  const command = remove(r);
  const removed = JSON.parse(db.sql(as(command)));
  assert.equal(removed.removed, true);
  assert.equal(removed.revision, "2");
  assert.deepEqual(JSON.parse(db.sql(as(command))), removed);
  assert.equal(db.sql("select count(*) from public.nest_memories where content is not null"), "0");
  assert.deepEqual(execute(r), saved);
  assert.equal(db.sql("select count(*) from public.nest_memories where content is not null"), "0");
  assert.throws(() => execute(pendingEdit), /Memory changed/);
  const resurrection = confirmed({ memoryId: r.payload.memoryId, expectedRevision: "2" });
  assert.throws(() => execute(resurrection), /Memory changed/);
  assert.throws(() => db.sql(as(remove(r, id(902), "0"))), /Invalid memory command/);
});

test("receipt insertion failure rolls back approval consumption and memory mutation", () => {
  const r = confirmed();
  db.sql(
    "create function private.fixture_fail_memory() returns trigger language plpgsql as $$ begin raise exception 'fixture receipt failure'; end $$; create trigger fixture_memory_receipt before insert on public.nest_memory_receipts for each row execute function private.fixture_fail_memory()",
  );
  try {
    assert.throws(() => execute(r), /fixture receipt failure/);
  } finally {
    db.sql(
      "drop trigger fixture_memory_receipt on public.nest_memory_receipts; drop function private.fixture_fail_memory()",
    );
  }
  assert.equal(status(r), "approved");
  assert.equal(count("nest_memories"), "0");
  assert.equal(count("nest_memory_receipts"), "0");
  assert.equal(execute(r).revision, "1");
});

test("revocation hides memory and blocks saves, deletion and receipt replays", () => {
  const r = confirmed();
  execute(r);
  db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  try {
    assert.throws(() => execute(r), /Not authorized/);
    assert.throws(() => db.sql(as(remove(r))), /Not authorized/);
    assert.equal(db.sql(as("select count(*) from public.nest_memories")), "0");
    assert.equal(db.sql(as("select count(*) from public.nest_memory_receipts")), "0");
  } finally {
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First')`,
    );
  }
});

test("parallel first saves cannot exceed the bounded active-memory limit, and deletion releases a slot", async () => {
  db.sql(`insert into public.nest_memories(actor_id,household_id,id,revision,content)
    select '${id(1)}','${id(10)}',gen_random_uuid(),1,'Fixture' from generate_series(1,63)`);
  const first = confirmed(),
    second = confirmed();
  const results = await Promise.allSettled([
    db.concurrent(as(save(first))),
    db.concurrent(as(save(second))),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    String(results.find((result) => result.status === "rejected").reason),
    /Memory limit reached/,
  );
  assert.equal(count("nest_memories"), "64");
  const winner = results[0].status === "fulfilled" ? first : second;
  db.sql(as(remove(winner)));
  assert.equal(execute(confirmed()).revision, "1");
  assert.equal(db.sql("select count(*) from public.nest_memories where content is not null"), "64");
});

test("generated Unicode and whitespace boundaries agree with the shared memory codec", () => {
  const samples = [
    null,
    "",
    ...["x", "字", "🥘", "x🥘", "\u00a0", "\ufeff", "\u0085", "\u2028"].flatMap((character) =>
      [1, 499, 500, 501, 999, 1000, 1001].map((length) => character.repeat(length)),
    ),
  ];
  const rows = samples.map((sample, index) => `(${index},${text(sample)})`).join(",");
  const actual = JSON.parse(
    db.sql(
      `select jsonb_agg(private.nest_valid_memory_content(value) order by position) from (values ${rows}) cases(position,value)`,
    ),
  );
  assert.deepEqual(
    actual,
    samples.map((sample) => Schema.is(MemoryContent)(sample)),
  );
  for (const content of [null, "\u00a0", "🥘".repeat(501)]) {
    const r = confirmed({ content });
    assert.throws(() => execute(r), /Invalid memory command/);
    assert.equal(status(r), "approved");
  }
  assert.equal(count("nest_memories"), "0");
});

test("membership revocation waits for an authorized in-flight memory save and then denies replay", async (t) => {
  const r = confirmed();
  const saving = db.concurrent(
    as(`set application_name='nest-memory-save'; begin; ${save(r)}; select pg_sleep(0.3); commit;`),
  );
  let waiting = false;
  for (let n = 0; n < 30; n++) {
    waiting =
      db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-memory-save' and wait_event='PgSleep'",
      ) === "1";
    if (waiting) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(waiting, true);
  t.after(() =>
    db.sql(`insert into public.household_members(household_id,user_id,display_name)
    values('${id(10)}','${id(1)}','First') on conflict do nothing`),
  );
  const revoke = db.concurrent(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await Promise.all([saving, revoke]);
  assert.equal(count("nest_memory_receipts"), "1");
  assert.equal(db.sql(as("select count(*) from public.nest_memories")), "0");
  assert.throws(() => execute(r), /Not authorized/);
});
