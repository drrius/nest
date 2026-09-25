import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as remoteFixture, model, id, Redacted } from "./meal-proposal-api-fixture.mjs";
import { fixture as sqliteFixture } from "../../apps/mobile/tests/offline-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { MealProposalRuntime } from "../../apps/mobile/src/meals/proposal-runtime.ts";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  run = Effect.runPromise;
const week = "2030-01-07";
async function backend(t, lose) {
  const remote = await remoteFixture(t),
    sqlite = await sqliteFixture(t),
    provider = model();
  const account = { actor: id(1), household: id(10) };
  const session = await run(sqlite.store.activate(account, id(990)));
  const server = nodeServer(
    createHandler(
      { url: remote.url, publishableKey: "sb_publishable_fixture" },
      {
        model: provider.instance,
        planningSecret: Redacted.make(remote.serverKey),
      },
    ),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const proxy = await lostResponseProxy(t, origin, `/v1/meals/proposal/${lose}`);
  const client = mealClient(
    proxy.url,
    account,
    Effect.succeed({ access_token: remote.bearer, refresh_token: "fixture", user: { id: id(1) } }),
  );
  let next = 800;
  const create = (store = sqlite.store) => {
    const runtime = new MealProposalRuntime(client, { store, session }, week, () => id(next++));
    t.after(() => runtime.dispose());
    return runtime;
  };
  return { remote, sqlite, provider, session, proxy, create, client };
}

test("native approval survives a committed response loss, write freeze and SQLite restart without re-posting meals", async (t) => {
  const f = await backend(t, "approve"),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  const preview = runtime.getSnapshot().proposal;
  await runtime.approve(preview.revision, preview.proposalId);
  assert.equal(f.proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "7");
  const operation = runtime.getSnapshot().attempt.approval.operationId;
  const before = proposalSnapshot(f.remote.db);
  freezeProposals(f.remote.db);
  runtime.dispose();
  const recovered = f.create(f.sqlite.reopen().store);
  await recovered.load();
  assert.equal(recovered.getSnapshot().proposal.status, "approved");
  assert.equal(recovered.getSnapshot().attempt.approval.operationId, operation);
  await recovered.continue();
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "7");
  assert.deepEqual(proposalSnapshot(f.remote.db), before);
  const savedWeek = await run(f.client.read(week));
  assert.equal(savedWeek.entries.length, 7);
  assert.deepEqual(
    savedWeek.entries.map((e) => e.title).sort(),
    preview.entries.map((e) => e.source.recipe.title).sort(),
  );
  assert.equal(f.provider.calls.length, 2);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
});

test("a changed real week refuses native approval and requires a refreshed explicit decision", async (t) => {
  const f = await backend(t, "unused"),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  f.remote.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','${week}','lunch','Partner meal')`,
  );
  await runtime.approve("2", runtime.getSnapshot().proposal.proposalId);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(runtime.getSnapshot().attempt.approval, undefined);
  assert.match(runtime.getSnapshot().notice, /changed/);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "1");
  await runtime.load();
  await runtime.discard("2", runtime.getSnapshot().proposal.proposalId);
  assert.equal(runtime.getSnapshot().proposal.status, "discarded");
  assert.equal(f.provider.calls.length, 2);
});

test("native SQLite restart recovers a committed generation after response loss and write freeze", async (t) => {
  const f = await backend(t, "generate"),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(f.proxy.dropped(), 1);
  assert.equal(f.provider.calls.length, 2);
  const operation = runtime.getSnapshot().attempt.generation.operationId;
  const before = proposalSnapshot(f.remote.db);
  freezeProposals(f.remote.db);
  runtime.dispose();
  const reopened = f.sqlite.reopen(),
    recovered = f.create(reopened.store);
  await recovered.load();
  assert.equal(recovered.getSnapshot().proposal.status, "ready");
  assert.equal(recovered.getSnapshot().attempt.generation.operationId, operation);
  assert.equal(f.provider.calls.length, 2);
  assert.deepEqual(proposalSnapshot(f.remote.db), before);
  const stored = reopened.connection.prepare("select data from meal_proposal_attempts").get().data;
  assert.equal(stored.includes("Vegetarian"), false);
  assert.equal(stored.includes("instructions"), false);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "0");
});

for (const frozen of [false, true]) {
  test(`lost reservation recovers its ID before model execution (frozen=${frozen})`, async (t) => {
    const f = await backend(t, "reserve"),
      runtime = f.create();
    await runtime.load();
    await runtime.start(false);
    assert.equal(f.proxy.dropped(), 1);
    assert.equal(f.provider.calls.length, 0);
    assert.equal(runtime.getSnapshot().attempt.proposalId, null);
    const before = proposalSnapshot(f.remote.db);
    if (frozen) freezeProposals(f.remote.db);
    runtime.dispose();
    const recovered = f.create(f.sqlite.reopen().store);
    await recovered.load();
    assert.equal(f.provider.calls.length, 0);
    if (frozen) {
      await recovered.continue();
      assert.ok(recovered.getSnapshot().attempt.proposalId);
      assert.equal(recovered.getSnapshot().fresh, false);
      assert.equal(f.provider.calls.length, 0);
      assert.equal(proposalSnapshot(f.remote.db), before);
      f.remote.db.sql(`select private.nest_set_household_writes_frozen(false);
      grant execute on function public.nest_recover_meal_proposal(uuid,uuid) to authenticated;`);
      assert.equal(f.provider.calls.length, 0);
    }
    await recovered.continue();
    assert.equal(recovered.getSnapshot().proposal.status, "ready");
    assert.equal(f.provider.calls.length, 2);
    assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_proposals"), "1");
    assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_proposal_jobs"), "1");
  });
}

test("lost native discard response recovers terminal state and revocation hides the preview", async (t) => {
  const f = await backend(t, "discard"),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  await runtime.discard("2", runtime.getSnapshot().proposal.proposalId);
  assert.equal(f.proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.continue();
  assert.equal(runtime.getSnapshot().proposal.status, "discarded");
  assert.equal(f.remote.db.sql("select revision from private.nest_meal_proposals"), "3");
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal, null);
  assert.equal(runtime.getSnapshot().access, "verify");
  assert.equal(f.provider.calls.length, 2);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
});
