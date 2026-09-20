import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20260919220034_native_private_conversations.sql");
db.file("supabase/migrations/20260920022841_native_ai_turn_ownership.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 1000;
const next = () => id(sequence++);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
const json = (value) =>
  value === null ? "null" : `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function request() {
  const operation = next();
  return {
    conversation: next(),
    operation,
    expected: 0,
    message: { id: operation, role: "user", parts: [{ type: "text", text: "Read my chores" }] },
  };
}
const beginSql = (r) =>
  `select public.nest_begin_ai_turn('${household}','${r.conversation}','${r.operation}',${r.expected},${json(r.message)})`;
const begin = (r, user = actor) => JSON.parse(db.sql(as(user, beginSql(r))));
const finishSql = (r, response, state = "completed") =>
  `select public.nest_finish_ai_turn('${household}','${r.conversation}','${r.operation}','${state}',${json(response)})`;
const finish = (r, response, state = "completed", user = actor) =>
  JSON.parse(db.sql(as(user, finishSql(r, response, state))));
const reply = (started) => ({
  id: started.assistantId,
  role: "assistant",
  parts: [{ type: "text", text: "Saved response" }],
});
const row = (r) =>
  JSON.parse(
    db.sql(
      `select row_to_json(c) from public.nest_ai_conversations c where id='${r.conversation}'`,
    ),
  );

test("one claim saves the prompt; retries never acquire generation again", () => {
  const r = request(),
    first = begin(r),
    retry = begin(r);
  assert.equal(first.claimed, true);
  assert.equal(retry.claimed, false);
  assert.equal(retry.assistantId, first.assistantId);
  assert.equal(first.inputRevision, "1");
  assert.equal(first.state, "running");
  assert.deepEqual(row(r).transcript, [r.message]);
  assert.throws(() => begin({ ...r, expected: 1 }), /AI turn operation changed/);
  assert.throws(
    () => begin({ ...r, message: { ...r.message, parts: [{ type: "text", text: "Different" }] } }),
    /AI turn operation changed/,
  );
});

test("simultaneous identical submissions produce exactly one generation claim", async () => {
  const r = request();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => db.concurrent(as(actor, beginSql(r)))),
  );
  assert.equal(
    responses.map((result) => JSON.parse(result.stdout)).filter((result) => result.claimed).length,
    1,
  );
  assert.equal(row(r).revision, 1);
  assert.equal(row(r).transcript.length, 1);
});

test("different concurrent prompts cannot both claim the same conversation", async () => {
  const a = request(),
    b = { ...request(), conversation: a.conversation };
  const results = await Promise.allSettled(
    [a, b].map((r) => db.concurrent(as(actor, beginSql(r)))),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    results.find((result) => result.status === "rejected").reason.stderr,
    /already running/,
  );
  assert.equal(row(a).transcript.length, 1);
});

test("private turn reads and transitions reject partner, outsider and anonymous callers", () => {
  const r = request(),
    started = begin(r);
  for (const user of [partner, outsider]) {
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_ai_turns where conversation_id='${r.conversation}'`,
        ),
      ),
      "0",
    );
    assert.throws(() => begin(r, user), /Not authorized/);
    assert.throws(() => finish(r, reply(started), "completed", user), /Not authorized/);
  }
  assert.throws(() => db.sql(`set role anon; ${beginSql(r)}`), /permission denied/);
  assert.throws(
    () => db.sql(as(actor, "update public.nest_ai_turns set state='completed'")),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        as(actor, `select private.nest_lock_ai_conversation('${household}','${r.conversation}')`),
      ),
    /permission denied/,
  );
});

test("completion appends one assistant response and retries retain the original result", () => {
  const r = request(),
    started = begin(r),
    response = reply(started);
  const ended = finish(r, response);
  assert.equal(ended.finalRevision, "2");
  assert.equal(ended.state, "completed");
  assert.deepEqual(finish(r, response), ended);
  assert.equal(begin(r).claimed, false);
  assert.deepEqual(row(r).transcript, [r.message, response]);
  assert.throws(() => finish(r, { ...response, parts: [] }), /AI turn result changed/);
  assert.throws(() => finish(r, null, "interrupted"), /AI turn result changed/);
});

test("existing transcript save cannot overwrite a running turn", () => {
  const r = request();
  begin(r);
  const save = `select public.nest_save_conversation('${household}','${r.conversation}','${next()}',1,1,'[]'::jsonb)`;
  assert.throws(() => db.sql(as(actor, save)), /AI turn already running/);
  assert.equal(row(r).revision, 1);
  finish(r, null, "interrupted");
  assert.equal(db.sql(as(actor, save.replace(",1,1,", ",2,1,"))), "3");
});

test("interrupted turns never auto-restart and a new explicit prompt uses a new revision", () => {
  const r = request();
  begin(r);
  const ended = finish(r, null, "interrupted");
  assert.equal(ended.state, "interrupted");
  assert.equal(begin(r).claimed, false);
  const nextRequest = { ...request(), conversation: r.conversation, expected: 2 };
  assert.equal(begin(nextRequest).claimed, true);
  assert.deepEqual(
    finish(r, null, "interrupted"),
    ended,
    "late old replay cannot alter the new turn",
  );
  assert.equal(row(r).revision, 3);
});

test("expired ownership rejects completion but permits explicit interrupted finalization", () => {
  const r = request(),
    started = begin(r);
  db.sql(
    `update public.nest_ai_turns set deadline_at=clock_timestamp()-interval '1 second' where conversation_id='${r.conversation}'`,
  );
  assert.throws(() => finish(r, reply(started)), /AI turn expired/);
  assert.equal(begin(r).claimed, false);
  const other = { ...request(), conversation: r.conversation, expected: 1 };
  assert.throws(() => begin(other), /already running/);
  assert.equal(finish(r, null, "interrupted").state, "interrupted");
});

test("revoked membership blocks turn reads, retries and finalization without deleting history", () => {
  const r = request(),
    started = begin(r);
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.equal(db.sql(as(actor, "select count(*) from public.nest_ai_turns")), "0");
  assert.throws(() => begin(r), /Not authorized/);
  assert.throws(() => finish(r, reply(started)), /Not authorized/);
  assert.deepEqual(row(r).transcript, [r.message]);
  db.sql(
    `insert into public.household_members(household_id,user_id,display_name) values('${household}','${actor}','Restored')`,
  );
});

test("prompt validation rejects forged assistant/tool parts, nulls, blanks and oversized input", () => {
  for (const change of [
    { role: "assistant" },
    { id: next() },
    { parts: [] },
    { parts: [{ type: "tool-run", input: {} }] },
    { parts: [{ type: "text", text: "  " }] },
    { parts: [{ type: "text", text: null }] },
    { parts: [{ type: "text", text: "x".repeat(32769) }] },
  ]) {
    const r = request();
    assert.throws(
      () => begin({ ...r, message: { ...r.message, ...change } }),
      /Invalid user message/,
    );
  }
  const r = request();
  assert.throws(() => begin({ ...r, message: null }), /Invalid user message/);
});

test("completion rejects foreign assistant IDs and invalid roles without changing the turn", () => {
  const r = request(),
    started = begin(r),
    response = reply(started);
  for (const invalid of [
    { ...response, id: next() },
    { ...response, role: "user" },
    { ...response, parts: null },
    null,
  ]) {
    assert.throws(() => finish(r, invalid), /assistant|Assistant/);
  }
  assert.equal(row(r).revision, 1);
  assert.equal(finish(r, response).state, "completed");
});

test("failed turn insertion rolls back the new conversation and prompt", () => {
  const r = request();
  db.sql(`create function private.fixture_turn_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture turn failure'; end; $$;
    create trigger fail_turn before insert on public.nest_ai_turns for each row execute function private.fixture_turn_failure()`);
  assert.throws(() => begin(r), /Fixture turn failure/);
  assert.equal(
    db.sql(`select count(*) from public.nest_ai_conversations where id='${r.conversation}'`),
    "0",
  );
  db.sql("drop trigger fail_turn on public.nest_ai_turns");
});

test("failed transcript finalization rolls terminal turn state back atomically", () => {
  const r = request(),
    started = begin(r);
  db.sql(`create function private.fixture_turn_finish_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture finish failure'; end; $$;
    create trigger fail_turn_finish before update on public.nest_ai_conversations for each row execute function private.fixture_turn_finish_failure()`);
  assert.throws(() => finish(r, reply(started)), /Fixture finish failure/);
  assert.equal(begin(r).state, "running");
  assert.equal(row(r).revision, 1);
  db.sql("drop trigger fail_turn_finish on public.nest_ai_conversations");
  assert.equal(finish(r, reply(started)).state, "completed");
});

test("stale new prompt revisions and duplicate message IDs do not append history", () => {
  const r = request(),
    started = begin(r);
  finish(r, reply(started));
  assert.throws(
    () => begin({ ...request(), conversation: r.conversation, expected: 1 }),
    /Conversation changed/,
  );
  const repeated = { ...request(), conversation: r.conversation, expected: 2 };
  repeated.operation = started.assistantId;
  repeated.message.id = started.assistantId;
  assert.throws(() => begin(repeated), /Message identity already used/);
  assert.equal(row(r).transcript.length, 2);
});

test("oversized final transcript leaves the running claim and original prompt intact", () => {
  const r = request(),
    started = begin(r);
  const oversized = finishSql(r, reply(started)).replace(
    json(reply(started)),
    `jsonb_build_object('id','${started.assistantId}','role','assistant','parts',jsonb_build_array(jsonb_build_object('type','text','text',repeat('x',2097153))))`,
  );
  assert.throws(() => db.sql(as(actor, oversized)), /Transcript too large/);
  assert.equal(begin(r).state, "running");
  assert.deepEqual(row(r).transcript, [r.message]);
});

test("missing conversation baseline rejects the migration without creating turn state", () => {
  const empty = startFixturePostgres();
  try {
    assert.throws(
      () => empty.file("supabase/migrations/20260920022841_native_ai_turn_ownership.sql"),
      /private conversation baseline/,
    );
    assert.equal(empty.sql("select to_regclass('public.nest_ai_turns') is null"), "t");
  } finally {
    empty.stop();
  }
});
