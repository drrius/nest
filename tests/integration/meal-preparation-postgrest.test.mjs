import { createRequire } from "node:module";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { routineClient } from "../../apps/mobile/src/routines/client.ts";
import { MealPreparationRuntime } from "../../apps/mobile/src/meals/preparation-runtime.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealRemovalFiles } from "../database/meal-removal-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = {
  operationId: id(201),
  weekStart: "2026-09-21",
  expectedRevision: "1",
  entryId: id(100),
  preparation: {
    title: "Prepare pasta",
    instructions: "é".repeat(4000),
    dueOn: "2026-09-21",
    assignment: { policy: "shared" },
  },
};
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "supabase/migrations/20260921024101_native_meal_preparation.sql",
    "supabase/migrations/20260921024848_native_meal_preparation_read.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(100)}','${id(10)}','2026-09-22','lunch','Pasta')`,
  );
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_create_meal_preparation")
    : null;
  const server = nodeServer(
    createHandler({ url: proxy?.url ?? remote.url, publishableKey: "sb_publishable_fixture" }),
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
  const connect = (bearer = remote.bearer) => {
    const headers = {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      "x-nest-household": id(10),
    };
    return {
      read: (revision = "1", extra = "") =>
        fetch(
          `${url}/v1/meals/preparation?entryId=${id(100)}&weekStart=2026-09-21&revision=${revision}${extra}`,
          { headers },
        ),
      create: (input = command) =>
        fetch(`${url}/v1/meals/preparation/create`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
    };
  };
  return { remote, proxy, url, connect };
}

test("preparation HTTP handles absent tasks, lost receipts, legacy instructions and partner reads", async (t) => {
  const f = await backend(t, true),
    owner = f.connect();
  const empty = await owner.read();
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).preparation, null);
  assert.equal((await owner.create()).status, 503);
  assert.equal(f.proxy.dropped(), 1);
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_preparation_receipts"),
  );
  f.remote.db.sql(
    `update public.routines set title='Later title', instructions=repeat('🍲',4000) where id='${receipt.routineId}'`,
  );
  const retry = await owner.create();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, receipt);
  const read = await f.connect(f.remote.partnerBearer).read();
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  const details = await read.json();
  assert.equal(details.entry.entryId, command.entryId);
  assert.equal(details.preparation.title, "Later title");
  assert.equal(details.preparation.instructions, "🍲".repeat(4000));
  assert.equal(details.preparation.dueOn, command.preparation.dueOn);
  assert.notEqual(details.preparation.routineVersion, receipt.routineVersion);
  assert.equal((await owner.read("0")).status, 409);
  for (const extra of ["&private=true", "&entryId=" + id(999)])
    assert.equal((await owner.read("1", extra)).status, 400);
  assert.equal((await f.connect(f.remote.otherBearer).read()).status, 403);
  assert.equal((await owner.create({ ...command, actorId: id(2) })).status, 400);
  assert.equal((await fetch(f.url + "/v1/meals/preparation/create")).status, 405);
  f.remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.equal((await owner.read()).status, 403);
  assert.equal((await owner.create()).status, 403);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
});
test("completed preparation remains readable and removed meal is explicitly absent", async (t) => {
  const f = await backend(t),
    owner = f.connect();
  const saved = await owner.create();
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).receipt;
  f.remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.complete_occurrence('${receipt.occurrenceId}','prep-done','2026-09-21')`,
  );
  const completed = await (await owner.read()).json();
  assert.equal(completed.preparation.status, "completed");
  f.remote.db.sql(
    `update public.meal_plan_entries set removed_at=now() where id='${command.entryId}'`,
  );
  assert.equal((await owner.read()).status, 409);
  const absent = await (await owner.read("2")).json();
  assert.equal(absent.entry, null);
  assert.equal(absent.preparation, null);
  assert.deepEqual((await (await owner.create()).json()).receipt, receipt);
});

const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect");
function nativeRuntime(f, actor = 1) {
  const account = { actor: id(actor), household: id(10) };
  const credentials = Effect.succeed({
    access_token: actor === 1 ? f.remote.bearer : f.remote.partnerBearer,
    refresh_token: "fixture",
    user: { id: id(actor) },
  });
  return new MealPreparationRuntime(
    {
      meals: mealClient(f.url, account, credentials),
      routines: routineClient(f.url, account, credentials),
    },
    { weekStart: command.weekStart, entryId: command.entryId },
    () => id(220 + actor),
  );
}
test("native preparation survives committed response loss and later partner completion without a second task", async (t) => {
  const f = await backend(t, true),
    runtime = nativeRuntime(f);
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "ready");
  assert.equal(runtime.getSnapshot().members.length, 2);
  await runtime.save(command.preparation);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(f.proxy.dropped(), 1);
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_preparation_receipts"),
  );
  f.remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(2) })}'; select public.complete_occurrence('${receipt.occurrenceId}','native-prep-done','2026-09-21')`,
  );
  await runtime.retry();
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  assert.deepEqual(runtime.getSnapshot().receipt, receipt);
  assert.equal(runtime.getSnapshot().snapshot.preparation.status, "completed");
  await runtime.save({ ...command.preparation, title: "Duplicate" });
  const partner = nativeRuntime(f, 2);
  t.after(() => partner.dispose());
  await partner.load();
  assert.equal(partner.getSnapshot().snapshot.preparation.status, "completed");
  await partner.save(command.preparation);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
  f.remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().receipt, null);
});
test("native preparation requires explicit reload after a stale meal and blocks removed targets", async (t) => {
  const f = await backend(t),
    runtime = nativeRuntime(f);
  t.after(() => runtime.dispose());
  await runtime.load();
  f.remote.db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner meal' where id='${command.entryId}'`,
  );
  await runtime.save(command.preparation);
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "0");
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot.entry.title, "Partner meal");
  f.remote.db.sql(
    `update public.meal_plan_entries set removed_at=now() where id='${command.entryId}'`,
  );
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot.entry, null);
  await runtime.save(command.preparation);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "0");
});

test("preparation roster and creation remain usable beyond the full routine list limit", async (t) => {
  const f = await backend(t),
    runtime = nativeRuntime(f);
  t.after(() => runtime.dispose());
  f.remote.db
    .sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_create_routine('${id(10)}', gen_random_uuid(), jsonb_build_object('title','Existing task '||n,'schedule',jsonb_build_object('kind','one_off','date','2026-09-21'),'assignment',jsonb_build_object('policy','shared'))) from generate_series(1,201) n`);
  const headers = { authorization: `Bearer ${f.remote.bearer}`, "x-nest-household": id(10) };
  assert.equal((await fetch(f.url + "/v1/routines", { headers })).status, 503);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "ready");
  assert.equal(runtime.getSnapshot().members.length, 2);
  await runtime.save(command.preparation);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().snapshot.preparation.title, command.preparation.title);
  const partner = nativeRuntime(f, 2);
  t.after(() => partner.dispose());
  await partner.load();
  assert.equal(partner.getSnapshot().snapshot.preparation.title, command.preparation.title);
  assert.equal(
    (
      await fetch(f.url + "/v1/routines/roster", {
        headers: { authorization: `Bearer ${f.remote.otherBearer}`, "x-nest-household": id(10) },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(f.url + "/v1/routines/roster", { method: "POST", headers })).status,
    405,
  );
});
