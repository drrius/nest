import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/legacy-chore-fixture.sql",
  "tests/integration/chore-postgrest.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
];
async function setup(t) {
  const f = await postgrestFixture(t, files);
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const read = (cursor, bearer = f.bearer) =>
    handler(
      new Request(
        `http://localhost/v1/assistant/conversations${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
        { headers: { authorization: `Bearer ${bearer}` } },
      ),
    );
  const seed = (n, actor = 1, home = 10, time = "2026-09-20T01:00:00.123456Z") =>
    f.db.sql(`
    insert into public.nest_ai_conversations(id,actor_id,household_id,revision,transcript,created_at,updated_at)
    values('${id(n)}','${id(actor)}','${id(home)}',9007199254740993,
    '[{"private":"fixture chat text"}]','${time}','${time}');`);
  return { ...f, read, seed, handler };
}

test("private conversation discovery pages exact timestamp ties without transcript content or duplicate pages", async (t) => {
  const f = await setup(t);
  for (let n = 800; n < 826; n++) f.seed(n);
  f.seed(799, 1, 10, "2026-09-20T01:00:00.123455Z");
  const response = await f.read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const first = await response.json();
  assert.equal(first.actorId, id(1));
  assert.equal(first.householdId, id(10));
  assert.equal(first.conversations.length, 20);
  assert.equal(first.conversations[0].revision, "9007199254740993");
  assert.equal(first.nextCursor, id(806));
  assert.ok(!JSON.stringify(first).includes("fixture chat text"));
  // New conversations and later activity cannot shift the creation-order cursor.
  f.seed(900, 1, 10, "2026-09-21T01:00:00Z");
  f.db.sql(`update public.nest_ai_conversations set updated_at=now() where id='${id(800)}'`);
  const second = await (await f.read(first.nextCursor)).json();
  assert.equal(second.conversations.length, 7);
  assert.equal(second.nextCursor, null);
  const ids = [...first.conversations, ...second.conversations].map((row) => row.conversationId);
  assert.equal(new Set(ids).size, 27);
  assert.equal(ids.at(-1), id(799), "microsecond timestamps are preserved in cursor comparisons");
  const end = await (await f.read(id(799))).json();
  assert.deepEqual(end.conversations, []);
  assert.equal(end.nextCursor, null);
});

test("discovery and cursor anchors remain owner-private and scoped to current membership", async (t) => {
  const f = await setup(t);
  f.seed(800);
  f.seed(801, 2);
  f.seed(802, 1, 20);
  const mine = await (await f.read()).json();
  assert.deepEqual(
    mine.conversations.map((row) => row.conversationId),
    [id(800)],
  );
  const partner = await (await f.read(undefined, f.partnerBearer)).json();
  assert.deepEqual(
    partner.conversations.map((row) => row.conversationId),
    [id(801)],
  );
  for (const cursor of [id(801), id(802), id(999)])
    assert.equal((await f.read(cursor)).status, 410);
  assert.equal((await f.read(id(800), f.partnerBearer)).status, 410);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await f.read()).status, 403);
});

test("discovery is available without a model and rejects invalid cursors, anonymous reads and writes", async (t) => {
  const f = await setup(t);
  assert.deepEqual((await (await f.read()).json()).conversations, []);
  for (const cursor of ["", "not-a-uuid", "0),actor_id.eq.other"])
    assert.equal((await f.read(cursor)).status, 400);
  assert.equal(
    (await f.handler(new Request("http://localhost/v1/assistant/conversations"))).status,
    401,
  );
  const write = await f.handler(
    new Request("http://localhost/v1/assistant/conversations", { method: "POST" }),
  );
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET");
});
