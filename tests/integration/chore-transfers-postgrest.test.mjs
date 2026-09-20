import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { choreTransferFiles } from "../database/chore-transfer-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_chore_transfer");
  const direct = createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" });
  const lossy = createHandler({ url: proxy.url, publishableKey: "sb_publishable_fixture" });
  const request = (path, input, bearer = remote.bearer, drop = false) =>
    (drop ? lossy : direct)(
      new Request(`http://localhost/v1/${path}`, {
        method: input ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "x-nest-household": id(10),
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
    );
  const created = await request("routines/create", {
    operationId: id(100),
    definition: {
      title: "Hand over one turn",
      schedule: { kind: "daily" },
      assignment: { policy: "alternating", anchorMemberId: id(1) },
    },
  });
  assert.equal(created.status, 200);
  const routine = (await created.json()).receipt;
  const current = (await (await request("chores")).json()).chores[0];
  const command = {
    operationId: id(101),
    occurrenceId: current.occurrenceId,
    expectedDueDate: current.dueDate,
    recipientId: id(2),
  };
  return { remote, proxy, request, routine, current, command };
}
test("real API request loss, recipient acceptance and replay preserve the accepted owner and future rotation", async (t) => {
  const { request, remote, proxy, current, command } = await backend(t);
  assert.equal(
    (await request("chores/transfers/request", command, remote.bearer, true)).status,
    503,
  );
  assert.equal(proxy.dropped(), 1);
  let list = await (await request("chores/transfers", undefined, remote.partnerBearer)).json();
  assert.equal(list.transfers.length, 1);
  assert.equal(list.members.length, 2);
  assert.equal((await (await request("chores")).json()).chores[0].assigneeId, id(1));
  const response = {
    operationId: id(102),
    requestId: list.transfers[0].requestId,
    action: "accept",
  };
  assert.equal((await request("chores/transfers/respond", response)).status, 403);
  const accepted = await request("chores/transfers/respond", response, remote.partnerBearer);
  assert.equal(accepted.status, 200);
  const ack = await accepted.json();
  assert.equal(ack.receipt.state, "accepted");
  assert.equal((await (await request("chores")).json()).chores[0].assigneeId, id(2));
  const replay = await request("chores/transfers/request", command);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).receipt.state, "pending");
  list = await (await request("chores/transfers")).json();
  assert.equal(list.transfers.length, 0);
  assert.deepEqual(
    await (await request("chores/transfers/respond", response, remote.partnerBearer)).json(),
    ack,
  );
  const completedOn = remote.db.sql("select private.household_today()::text");
  assert.equal(
    (
      await request(
        "chores/complete",
        {
          operationId: id(103),
          occurrenceId: current.occurrenceId,
          expectedDueDate: current.dueDate,
          completedOn,
        },
        remote.partnerBearer,
      )
    ).status,
    200,
  );
  const successor = (await (await request("chores")).json()).chores[0];
  assert.notEqual(successor.occurrenceId, current.occurrenceId);
  assert.equal(successor.assigneeId, id(2));
});
test("lost acceptance replays after a partner rebuild, while invalid, foreign and revoked access are denied", async (t) => {
  const { request, remote, proxy, routine, command } = await backend(t);
  const pending = await request("chores/transfers/request", command);
  assert.equal(pending.status, 200);
  const response = {
    operationId: id(102),
    requestId: (await pending.json()).receipt.requestId,
    action: "accept",
  };
  assert.equal(
    (await request("chores/transfers/respond", response, remote.partnerBearer, true)).status,
    503,
  );
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(
    remote.db.sql(
      `select result from public.nest_chore_transfer_receipts where operation_id='${id(102)}'`,
    ),
  );
  assert.equal(
    (
      await request("routines/edit", {
        operationId: id(103),
        routineId: routine.routineId,
        expectedVersion: routine.version,
        patch: { schedule: { kind: "weekly", weekday: 3 } },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request("chores/transfers/respond", response, remote.partnerBearer)).json())
      .receipt,
    stored,
  );
  assert.equal(
    (
      await request(
        "chores/transfers/respond",
        { ...response, actorId: id(1) },
        remote.partnerBearer,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("chores/transfers/respond", response, remote.otherBearer)).status,
    403,
  );
  assert.equal((await request("chores/transfers", undefined, "invalid")).status, 401);
  remote.db.sql(
    `delete from public.push_outbox; delete from public.inbox_notifications; update public.routine_occurrences set planned_assignee_id=null; delete from public.household_members where user_id='${id(2)}'`,
  );
  assert.equal(
    (await request("chores/transfers/respond", response, remote.partnerBearer)).status,
    403,
  );
});
