import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/approval-fixture.sql",
  "tests/integration/food-postgrest.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260920054303_native_private_memory.sql",
  "supabase/migrations/20260920055247_native_memory_confirmation.sql",
  "supabase/migrations/20260926095607_native_memory_nonretryable_conflicts.sql",
];
const command = {
  operationId: id(100),
  memoryId: id(101),
  expectedRevision: "0",
  content: "Quiet mornings",
};
function client(f, bearer = f.bearer) {
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const headers = {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  return (path = "", input) =>
    handler(
      new Request(`http://localhost/v1/memories${path}`, {
        headers,
        method: input === undefined ? "GET" : "POST",
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
    );
}
async function proposal(owner, input = command) {
  const response = await owner("/propose", input);
  assert.equal(response.status, 200);
  return (await response.json()).approval;
}
const decision = (approval, approved = true) => ({
  ...approval.change,
  operationId: approval.operationId,
  approvalId: approval.id,
  approved,
});

test("memory HTTP flow keeps proposals inactive and private until explicit confirmation, then supports edit and deletion", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f),
    partner = client(f, f.partnerBearer);
  const approval = await proposal(owner);
  assert.equal(approval.status, "pending");
  const initial = await owner();
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.deepEqual((await initial.json()).memories, []);
  assert.equal((await partner(`/approval?id=${approval.id}`)).status, 403);
  assert.equal((await partner("/decide", decision(approval))).status, 403);
  assert.equal((await client(f, f.otherBearer)()).status, 403);
  assert.equal((await owner("/decide", decision(approval))).status, 200);
  assert.deepEqual((await (await owner()).json()).memories, [
    { id: command.memoryId, revision: "1", content: command.content },
  ]);
  assert.deepEqual((await (await partner()).json()).memories, []);
  const edit = await proposal(owner, {
    ...command,
    operationId: id(102),
    expectedRevision: "1",
    content: "Updated preference",
  });
  assert.equal((await owner("/decide", decision(edit))).status, 200);
  const remove = { operationId: id(103), memoryId: command.memoryId, expectedRevision: "2" };
  const removed = await owner("/remove", remove);
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).receipt.removed, true);
  assert.equal((await owner("/remove", remove)).status, 200);
  assert.equal((await owner("/decide", decision(edit))).status, 200);
  assert.deepEqual((await (await owner()).json()).memories, []);
});

test("lost proposal and atomic confirmation acknowledgments recover through the same identities", async (t) => {
  const f = await postgrestFixture(t, files);
  const proposalProxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_propose_action");
  const proposer = client({ ...f, url: proposalProxy.url });
  assert.equal((await proposer("/propose", command)).status, 503);
  const approval = await proposal(proposer);
  assert.equal(proposalProxy.dropped(), 1);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  const confirmationProxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_decide_memory");
  const owner = client({ ...f, url: confirmationProxy.url });
  assert.equal((await owner("/decide", decision(approval))).status, 503);
  assert.equal(confirmationProxy.dropped(), 1);
  const state = await (await owner(`/approval?id=${approval.id}`)).json();
  assert.equal(state.approval.status, "consumed");
  assert.equal((await owner("/decide", decision(approval))).status, 200);
  assert.equal(f.db.sql("select count(*) from public.nest_memory_receipts"), "1");
});

test("denied and expired confirmations fail, while stale edits stay pending and can be denied", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f);
  const denied = await proposal(owner);
  assert.equal((await owner("/decide", decision(denied, false))).status, 200);
  assert.equal((await owner("/decide", decision(denied))).status, 409);
  const expired = await proposal(owner, { ...command, operationId: id(102) });
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired.id}'`,
  );
  assert.equal((await owner("/decide", decision(expired))).status, 409);
  const fresh = await proposal(owner, { ...command, operationId: id(103) });
  assert.equal((await owner("/decide", decision(fresh))).status, 200);
  const stale = await proposal(owner, { ...command, operationId: id(104) });
  assert.equal((await owner("/decide", decision(stale))).status, 409);
  assert.equal((await (await owner(`/approval?id=${stale.id}`)).json()).approval.status, "pending");
  assert.equal((await owner("/decide", decision(stale, false))).status, 200);
  assert.equal(f.db.sql("select count(*) from public.nest_memory_receipts"), "1");
});

test("memory body/schema bounds and identity binding reject injected consent, malformed reads and revoked access", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f);
  for (const patch of [
    { actorId: id(2) },
    { approved: true },
    { content: " " },
    { content: "\u0000" },
    { content: "\ud800" },
    { content: "🥘".repeat(501) },
    { content: "x".repeat(9000) },
  ])
    assert.equal((await owner("/propose", { ...command, ...patch })).status, 400);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal((await owner("/approval?id=invalid")).status, 400);
  const approval = await proposal(owner, { ...command, content: "\u0001".repeat(1000) });
  assert.equal((await owner("/decide", { ...decision(approval), content: "changed" })).status, 400);
  assert.equal((await owner("/decide", decision(approval))).status, 200);
  assert.equal((await (await owner()).json()).memories[0].content.length, 1000);
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  assert.equal((await owner()).status, 403);
  assert.equal((await owner(`/approval?id=${approval.id}`)).status, 403);
  assert.equal((await owner("/decide", decision(approval))).status, 403);
});

test("full memory capacity is a recoverable conflict and does not commit the approval decision", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f);
  f.db.sql(`insert into public.nest_memories(actor_id,household_id,id,revision,content)
    select '${id(1)}','${id(10)}',gen_random_uuid(),1,'Fixture' from generate_series(1,64)`);
  const approval = await proposal(owner);
  assert.equal((await owner("/decide", decision(approval))).status, 409);
  assert.equal(
    (await (await owner(`/approval?id=${approval.id}`)).json()).approval.status,
    "pending",
  );
  const memory = (await (await owner()).json()).memories[0];
  assert.equal(
    (
      await owner("/remove", {
        operationId: id(105),
        memoryId: memory.id,
        expectedRevision: memory.revision,
      })
    ).status,
    200,
  );
  assert.equal((await owner("/decide", decision(approval))).status, 200);
  assert.equal((await (await owner()).json()).memories.length, 64);
});

test("expired memory consent returns raw non-retryable conflict with no consent or memory writes", async (t) => {
  const f = await postgrestFixture(t, files);
  const approval = await proposal(client(f));
  f.db.sql(`update public.nest_action_approvals set expires_at=now()-interval '1 second'
    where id='${approval.id}'`);
  const response = await fetch(`${f.url}/rest/v1/rpc/nest_decide_memory`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_operation: command.operationId,
      p_memory: command.memoryId,
      p_expected: 0,
      p_content: command.content,
      p_approval: approval.id,
      p_approved: true,
    }),
  });
  assert.equal(response.status, 412);
  assert.equal((await response.json()).code, "PT412");
  assert.equal(f.db.sql("select count(*) from public.nest_memories"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_memory_receipts"), "0");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval.id}'`),
    "pending",
  );
});
