import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiChoreTransferFiles } from "../database/ai-chore-transfer-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(t) {
  const remote = await postgrestFixture(t, [
    ...aiChoreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const as = (sql, actor = 1) =>
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(actor) })}'; ${sql}`;
  const definition = {
    title: "SDK handover",
    schedule: { kind: "daily" },
    assignment: { policy: "assigned", memberId: id(1) },
  };
  const routine = JSON.parse(
    remote.db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(800)}','${JSON.stringify(definition)}')`,
      ),
    ),
  );
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turns = [1, 2].map((actor) => ({
    conversationId: id(900 + actor),
    operationId: id(910 + actor),
    expectedRevision: "0",
    text: "Answer this handover",
  }));
  for (const [index, turn] of turns.entries()) {
    const message = {
      id: turn.operationId,
      role: "user",
      parts: [{ type: "text", text: turn.text }],
    };
    remote.db.sql(
      as(
        `select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`,
        index + 1,
      ),
    );
  }
  const connect = (actor, lossy = false, turnActor = actor) =>
    householdTools(
      new Request("http://localhost/", {
        headers: { authorization: `Bearer ${actor === 1 ? remote.bearer : remote.partnerBearer}` },
      }),
      { url: lossy ? proxy.url : remote.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn: turns[turnActor - 1] },
    ).tools;
  return { remote, proxy, as, routine, connect };
}
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function readRequest(f) {
  const read = await f.connect(1).readChoreTransfers.execute({}, options("read"));
  assert.equal(read.ok, true);
  assert.equal(read.value.actorId, id(1));
  assert.equal(read.value.members.length, 2);
  const chore = read.value.chores[0];
  assert.equal(chore.assigneeId, id(1));
  return { occurrenceId: chore.occurrenceId, expectedDueDate: chore.dueDate, recipientId: id(2) };
}
test("SDK lost handover request replays its pending receipt after the recipient has accepted", async (t) => {
  const f = await setup(t),
    input = await readRequest(f),
    tools = f.connect(1, true);
  assert.deepEqual(await tools.requestChoreTransfer.execute(input, options("request")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.requestChoreTransfer.execute(input, options("replacement")), {
    ok: false,
    code: "unavailable",
  });
  const read = await f.connect(2).readChoreTransfers.execute({}, options("read-incoming"));
  assert.equal(read.value.actorId, id(2));
  const pending = read.value.transfers[0];
  assert.equal(read.value.chores[0].assigneeId, id(1));
  const result = await f
    .connect(2)
    .respondChoreTransfer.execute(
      { requestId: pending.requestId, action: "accept" },
      options("accept"),
    );
  assert.equal(result.ok, true);
  assert.equal(result.value.state, "accepted");
  const retry = await f.connect(1, true).requestChoreTransfer.execute(input, options("request"));
  assert.equal(retry.ok, true);
  assert.equal(retry.value.state, "pending");
  assert.equal(retry.value.requestId, pending.requestId);
  const fresh = await f.connect(1).readChoreTransfers.execute({}, options("refresh"));
  assert.equal(fresh.value.chores[0].assigneeId, id(2));
  assert.deepEqual(fresh.value.transfers, []);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_transfer_receipts"), "2");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "2");
  assert.deepEqual(
    await f.connect(2, false, 1).requestChoreTransfer.execute(input, options("request")),
    { ok: false, code: "forbidden" },
  );
});
test("SDK lost acceptance replays after a routine rebuild without transferring the replacement occurrence", async (t) => {
  const f = await setup(t),
    input = await readRequest(f);
  const pending = await f.connect(1).requestChoreTransfer.execute(input, options("request"));
  const response = { requestId: pending.value.requestId, action: "accept" };
  assert.deepEqual(
    await f.connect(2, true).respondChoreTransfer.execute(response, options("accept")),
    { ok: false, code: "unavailable" },
  );
  assert.equal(f.proxy.dropped(), 1);
  f.remote.db.sql(
    f.as(
      `select public.nest_edit_routine('${id(10)}','${id(802)}','${f.routine.routineId}','${f.routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`,
    ),
  );
  const saved = await f.connect(2, true).respondChoreTransfer.execute(response, options("accept"));
  assert.equal(saved.ok, true);
  assert.equal(saved.value.state, "accepted");
  assert.equal(saved.value.occurrenceId, input.occurrenceId);
  const fresh = await f.connect(2).readChoreTransfers.execute({}, options("refresh"));
  assert.notEqual(fresh.value.chores[0].occurrenceId, input.occurrenceId);
  assert.equal(fresh.value.chores[0].assigneeId, id(1));
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_transfer_receipts"), "2");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "2");
});
