import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20260919220034_native_private_conversations.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 100;
const next = () => id(sequence++);
const transcript = [
  {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "Private fixture conversation" }],
  },
];
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
const request = (changes = {}) => ({
  conversation: next(),
  operation: next(),
  expected: 0,
  schema: 1,
  transcript,
  ...changes,
});
const sql = (r) =>
  `select public.nest_save_conversation('${r.household ?? household}','${r.conversation}','${r.operation}',${r.expected},${r.schema},'${JSON.stringify(r.transcript)}'::jsonb)`;
const save = (user, r) => db.sql(as(user, sql(r)));
const row = (r) =>
  JSON.parse(
    db.sql(
      `select row_to_json(c) from public.nest_ai_conversations c where id='${r.conversation}'`,
    ),
  );

test("private transcripts and receipts are invisible to partner, outsider and anonymous callers", () => {
  const r = request();
  save(actor, r);
  for (const user of [partner, outsider]) {
    assert.equal(
      db.sql(
        as(user, `select count(*) from public.nest_ai_conversations where id='${r.conversation}'`),
      ),
      "0",
    );
    assert.equal(
      db.sql(
        as(
          user,
          `select count(*) from public.nest_ai_conversation_saves where conversation_id='${r.conversation}'`,
        ),
      ),
      "0",
    );
    assert.throws(() => save(user, r), /Not authorized/);
  }
  assert.throws(() => db.sql(`set role anon; ${sql(r)}`), /permission denied/);
  assert.throws(
    () =>
      db.sql(
        as(
          actor,
          `update public.nest_ai_conversations set actor_id='${partner}' where id='${r.conversation}'`,
        ),
      ),
    /permission denied/,
  );
});

test("durable save replay returns its original revision even after a later save", () => {
  const r = request();
  assert.equal(save(actor, r), "1");
  const changed = {
    ...r,
    operation: next(),
    expected: 1,
    transcript: [
      ...transcript,
      { id: "response-1", role: "assistant", parts: [{ type: "text", text: "Reply" }] },
    ],
  };
  assert.equal(save(actor, changed), "2");
  assert.equal(save(actor, r), "1");
  assert.equal(row(r).revision, 2);
  assert.deepEqual(row(r).transcript, changed.transcript);
});

test("reusing an operation with changed content or revision fails without altering the transcript", () => {
  const r = request();
  save(actor, r);
  for (const change of [{ transcript: [] }, { expected: 1 }]) {
    assert.throws(() => save(actor, { ...r, ...change }), /Conversation operation changed/);
  }
  assert.deepEqual(row(r).transcript, transcript);
});

test("concurrent writers cannot silently overwrite each other", async () => {
  const r = request();
  save(actor, r);
  const a = {
    ...r,
    operation: next(),
    expected: 1,
    transcript: [{ id: "a", role: "user", parts: [] }],
  };
  const b = {
    ...r,
    operation: next(),
    expected: 1,
    transcript: [{ id: "b", role: "user", parts: [] }],
  };
  const results = await Promise.allSettled([
    db.concurrent(as(actor, sql(a))),
    db.concurrent(as(actor, sql(b))),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.match(rejected.reason.stderr, /Conversation changed/);
  assert.equal(row(r).revision, 2);
});

test("simultaneous duplicate first saves create one conversation revision and receipt", async () => {
  const r = request();
  await Promise.all([db.concurrent(as(actor, sql(r))), db.concurrent(as(actor, sql(r)))]);
  assert.equal(row(r).revision, 1);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_conversation_saves where conversation_id='${r.conversation}'`,
    ),
    "1",
  );
});

test("receipt failure rolls the saved transcript and revision back together", () => {
  const r = request();
  save(actor, r);
  db.sql(`create function private.fixture_chat_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture save failure'; end; $$;
    create trigger fail_chat before insert on public.nest_ai_conversation_saves
    for each row execute function private.fixture_chat_failure()`);
  assert.throws(
    () => save(actor, { ...r, operation: next(), expected: 1, transcript: [] }),
    /Fixture save failure/,
  );
  assert.equal(row(r).revision, 1);
  assert.deepEqual(row(r).transcript, transcript);
  db.sql("drop trigger fail_chat on public.nest_ai_conversation_saves");
});

test("unknown schema versions, non-array and oversized envelopes are rejected", () => {
  for (const changes of [
    { schema: 2 },
    { transcript: {} },
    { transcript: Array.from({ length: 1001 }, () => ({})) },
  ]) {
    assert.throws(() => save(actor, request(changes)), /transcript|Transcript/);
  }
  const r = request();
  const oversized = sql(r).replace(
    `'${JSON.stringify(transcript)}'::jsonb`,
    `jsonb_build_array(repeat('x',2097153))`,
  );
  assert.throws(() => db.sql(as(actor, oversized)), /Transcript too large/);
  assert.equal(
    db.sql(`select count(*) from public.nest_ai_conversations where id='${r.conversation}'`),
    "0",
  );
});

test("revoked membership blocks reads and replay without transferring the private conversation", () => {
  const r = request();
  save(actor, r);
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.equal(db.sql(as(actor, "select count(*) from public.nest_ai_conversations")), "0");
  assert.throws(() => save(actor, r), /Not authorized/);
  assert.deepEqual(row(r).transcript, transcript);
  db.sql(`insert into public.household_members values('${household}','${actor}')`);
});

test("opaque SDK approval parts round-trip as transcript data", () => {
  const r = request({
    transcript: [
      {
        id: "approval-1",
        role: "assistant",
        parts: [
          {
            type: "tool-record",
            toolCallId: "invocation-1",
            state: "approval-responded",
            approval: { id: "forged", approved: true },
          },
        ],
      },
    ],
  });
  save(actor, r);
  assert.deepEqual(row(r).transcript, r.transcript);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_conversation_saves where conversation_id='${r.conversation}'`,
    ),
    "1",
  );
});
