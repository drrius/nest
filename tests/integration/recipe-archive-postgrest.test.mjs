import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeCreationFiles, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const command = () => ({
  expectedRevision: "1",
  definitionId: "ABCDEF00-0000-4000-8000-000000000200",
  operationId: "ABCDEF00-0000-4000-8000-000000000201",
});
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "supabase/migrations/20260920235917_native_recipe_archive.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_definitions(id,household_id,name) values('${command().definitionId}','${id(10)}','Archive soup')`,
  );
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_archive_recipe")
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
  const archive = (value = command(), bearer = remote.bearer) =>
    fetch(`${url}/v1/meals/recipe/archive`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-nest-household": id(10),
      },
      body: JSON.stringify(value),
    });
  return { remote, proxy, url, archive };
}

test("archive HTTP recovers original receipt after restoration without re-archiving and rejects revoked recovery", async (t) => {
  const { remote, proxy, archive, url } = await backend(t, true);
  assert.equal((await archive()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(
    remote.db.sql("select result from public.nest_recipe_archive_receipts"),
  );
  assert.equal(stored.definitionId, command().definitionId.toLowerCase());
  assert.equal(stored.revision, "2");
  remote.db.sql(
    `update public.meal_definitions set archived_at=null,name='Partner restored' where id='${stored.definitionId}'`,
  );
  const retry = await archive();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, stored);
  assert.equal(
    remote.db.sql(
      `select archived_at is null from public.meal_definitions where id='${stored.definitionId}'`,
    ),
    "t",
  );
  assert.equal(
    (await archive({ ...command(), operationId: id(900) }, remote.partnerBearer)).status,
    409,
  );
  assert.equal((await archive(command(), remote.otherBearer)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/recipe/archive`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/recipe/archive`)).status, 405);
  assert.equal((await archive({ ...command(), actorId: id(2) })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await archive()).status, 403);
});
