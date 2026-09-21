import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealRemovalFiles } from "../database/meal-removal-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { entryId: id(100), weekStart: "2030-01-07", expectedRevision: "1" };
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "supabase/migrations/20260920093203_native_routine_editing.sql",
    "supabase/migrations/20260921024101_native_meal_preparation.sql",
    "supabase/migrations/20260921024848_native_meal_preparation_read.sql",
    "supabase/migrations/20260921032305_native_meal_preparation_editing.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(100)}','${id(10)}','2030-01-07','dinner','Pasta')`,
  );
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_edit_meal_preparation");
  const server = nodeServer(
    createHandler({ url: proxy.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = (bearer = remote.bearer) => ({
    authorization: `Bearer ${bearer}`,
    "x-nest-household": id(10),
    "content-type": "application/json",
  });
  const write = (path, value, bearer) =>
    fetch(url + path, { method: "POST", headers: headers(bearer), body: JSON.stringify(value) });
  const read = (bearer) =>
    fetch(
      url +
        `/v1/meals/preparation?entryId=${target.entryId}&weekStart=${target.weekStart}&revision=1`,
      { headers: headers(bearer) },
    );
  const response = await write("/v1/meals/preparation/create", {
    ...target,
    operationId: id(200),
    preparation: {
      title: "Prepare pasta",
      instructions: "Use water",
      dueOn: "2030-01-06",
      assignment: { policy: "shared" },
    },
  });
  assert.equal(response.status, 200);
  return { remote, proxy, url, headers, write, read, created: (await response.json()).receipt };
}
test("preparation edit HTTP replays after lost response and partner completion without changing history", async (t) => {
  const f = await backend(t);
  const command = {
    ...target,
    routineId: f.created.routineId,
    expectedRoutineVersion: f.created.routineVersion,
    operationId: id(201),
    patch: {
      instructions: "é".repeat(4000),
      dueOn: "2030-01-05",
      assignment: { policy: "assigned", memberId: id(2) },
    },
  };
  assert.equal((await f.write("/v1/meals/preparation/edit", command)).status, 503);
  assert.equal(f.proxy.dropped(), 1);
  const saved = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_preparation_edit_receipts"),
  );
  f.remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(2) })}'; select public.complete_occurrence('${saved.occurrenceId}','http-edit-complete','2030-01-05')`,
  );
  const retry = await f.write("/v1/meals/preparation/edit", command);
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, saved);
  const detail = await (await f.read(f.remote.partnerBearer)).json();
  assert.equal(detail.preparation.status, "completed");
  assert.equal(detail.preparation.plannedAssigneeId, id(2));
  assert.equal(detail.preparation.instructions, "é".repeat(4000));
  const corrected = {
    ...command,
    operationId: id(202),
    expectedRoutineVersion: detail.preparation.routineVersion,
    patch: { instructions: null },
  };
  const cleared = await f.write("/v1/meals/preparation/edit", corrected);
  assert.equal(cleared.status, 200);
  const next = (await cleared.json()).receipt;
  assert.equal((await (await f.read()).json()).preparation.instructions, null);
  const invalidDate = {
    ...corrected,
    operationId: id(203),
    expectedRoutineVersion: next.routineVersion,
    patch: { dueOn: "2030-01-04" },
  };
  assert.equal((await f.write("/v1/meals/preparation/edit", invalidDate)).status, 409);
  assert.equal(
    (await f.write("/v1/meals/preparation/edit", { ...corrected, actorId: id(2) })).status,
    400,
  );
  assert.equal(
    (await f.write("/v1/meals/preparation/edit", corrected, f.remote.otherBearer)).status,
    403,
  );
  assert.equal(
    (await fetch(f.url + "/v1/meals/preparation/edit", { headers: f.headers() })).status,
    405,
  );
  f.remote.db.sql(
    `delete from public.inbox_notifications; delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.equal((await f.write("/v1/meals/preparation/edit", command)).status, 403);
  assert.equal(
    f.remote.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"),
    "2",
  );
});
