import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, input, id, options } from "./ai-proposal-tools-fixture.mjs";
import { fixture as sqliteFixture } from "../../apps/mobile/tests/offline-fixture.mjs";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { MealProposalRuntime } from "../../apps/mobile/src/meals/proposal-runtime.ts";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { Effect, run } from "./native-proposal-edit-fixture.mjs";
test("assistant-generated proposal card opens native preview and saves only after explicit approval", async (t) => {
  const f = await fixture(t),
    tools = f.connect();
  const generated = await tools.generateMealProposal.execute(input(), options("generate"));
  assert.equal(generated.ok, true);
  const card = actionResult({
    type: "tool-generateMealProposal",
    state: "output-available",
    output: generated,
  });
  assert.equal(card.href.pathname, "/meal-proposal");
  const sqlite = await sqliteFixture(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(sqlite.store.activate(account, id(990)));
  const server = nodeServer(
    createHandler({ url: f.remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const client = mealClient(
    `http://127.0.0.1:${server.address().port}/`,
    account,
    Effect.succeed({
      access_token: f.remote.bearer,
      refresh_token: "fixture",
      user: { id: id(1) },
    }),
  );
  const runtime = new MealProposalRuntime(
    client,
    { store: sqlite.store, session },
    card.href.params,
    () => id(995),
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal.status, "ready");
  assert.equal(runtime.getSnapshot().attempt.generation.operationId, generated.value.operationId);
  assert.equal((await run(client.read(input().weekStart))).entries.length, 0);
  const shown = runtime.getSnapshot().proposal;
  await runtime.approve(shown.revision, shown.proposalId);
  assert.equal(runtime.getSnapshot().proposal.status, "approved");
  assert.equal((await run(client.read(input().weekStart))).entries.length, shown.entries.length);
  assert.equal(f.provider.calls.length, 2);
  const read = await tools.readMealProposal.execute(
    { proposalId: shown.proposalId },
    options("after-approval"),
  );
  assert.equal(read.value.envelope.proposal.status, "approved");
});
