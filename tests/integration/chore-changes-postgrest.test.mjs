import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { choreTransferFiles } from "../database/chore-transfer-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t, drop = false) {
  const remote = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = drop
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_change_chore")
    : null;
  const handler = createHandler({
    url: proxy?.url ?? remote.url,
    publishableKey: "sb_publishable_fixture",
  });
  const request = (path, input, bearer = remote.bearer) =>
    handler(
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
      title: "Change through API",
      schedule: { kind: "daily" },
      assignment: { policy: "shared" },
    },
  });
  assert.equal(created.status, 200);
  const routine = (await created.json()).receipt;
  const current = (await (await request("chores")).json()).chores[0];
  const date = remote.db.sql(`select ('${current.dueDate}'::date+1)::text`);
  const command = {
    operationId: id(101),
    occurrenceId: current.occurrenceId,
    expectedDueDate: current.dueDate,
    newDueDate: date,
  };
  return { remote, proxy, request, routine, current, command };
}
test("actual API reschedules and skips exact current occurrences with conflicts and tenant denial", async (t) => {
  const { request, current, command } = await backend(t);
  assert.equal((await request("chores/reschedule", command)).status, 200);
  const changed = (await (await request("chores")).json()).chores[0];
  assert.equal(changed.occurrenceId, current.occurrenceId);
  assert.equal(changed.dueDate, command.newDueDate);
  const skip = {
    operationId: id(102),
    occurrenceId: current.occurrenceId,
    expectedDueDate: current.dueDate,
  };
  assert.equal((await request("chores/skip", skip)).status, 409);
  skip.expectedDueDate = changed.dueDate;
  assert.equal((await request("chores/skip", skip, "invalid-token")).status, 401);
  const response = await request("chores/skip", skip);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.receipt.status, "skipped");
  assert.deepEqual(await (await request("chores/skip", skip)).json(), saved);
  assert.notEqual(
    (await (await request("chores")).json()).chores[0].occurrenceId,
    current.occurrenceId,
  );
  assert.equal((await request("chores/skip", { ...skip, actorId: id(2) })).status, 400);
});
test("lost reschedule acknowledgment replays after partner rebuild and rejects foreign or revoked access", async (t) => {
  const { remote, proxy, request, routine, command } = await backend(t, true);
  assert.equal((await request("chores/reschedule", command)).status, 503);
  assert.equal(proxy.dropped(), 1);
  assert.equal(
    (
      await request(
        "routines/edit",
        {
          operationId: id(102),
          routineId: routine.routineId,
          expectedVersion: routine.version,
          patch: { schedule: { kind: "weekly", weekday: 3 } },
        },
        remote.partnerBearer,
      )
    ).status,
    200,
  );
  const replay = await request("chores/reschedule", command);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).receipt.dueDate, command.newDueDate);
  assert.equal((await request("chores/reschedule", command, remote.otherBearer)).status, 403);
  assert.equal(remote.db.sql("select count(*) from public.nest_chore_change_receipts"), "1");
  remote.db.sql(`delete from public.push_outbox; delete from public.inbox_notifications;
    delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await request("chores/reschedule", command)).status, 403);
});
