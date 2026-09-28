import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/conversation-fixture.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "tests/database/assistant-cancellation-draft.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  db.sql(`set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`);
const cancel = (conversation, operation) =>
  `select public.nest_cancel_unstarted_ai_turn('${id(10)}','${id(conversation)}','${id(operation)}')`;
const begin = (conversation, operation) =>
  `select public.nest_begin_ai_turn('${id(10)}','${id(conversation)}','${id(operation)}',0,'${JSON.stringify({ id: id(operation), role: "user", parts: [{ type: "text", text: "Hello" }] })}'::jsonb)`;
test("cancelled identity stays cancelled while another operation can begin", () => {
  assert.equal(JSON.parse(as(1, cancel(100, 101))).cancelled, true);
  assert.equal(JSON.parse(as(1, cancel(100, 101))).cancelled, true);
  assert.throws(() => as(1, begin(100, 101)), /AI turn cancelled/);
  assert.equal(JSON.parse(as(1, begin(100, 102))).claimed, true);
  assert.equal(JSON.parse(as(1, cancel(100, 102))).cancelled, false);
});
test("partner, outsider and anonymous cannot cancel another private conversation", () => {
  for (const actor of [2, 3]) assert.throws(() => as(actor, cancel(100, 103)), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${cancel(100, 103)}`), /permission denied/);
  assert.throws(() => as(1, "select * from private.nest_ai_cancelled_turns"), /permission denied/);
});
