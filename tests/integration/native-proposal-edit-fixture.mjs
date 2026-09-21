import { createRequire } from "node:module";
import { fixture as remoteFixture, Redacted, id } from "./meal-proposal-api-fixture.mjs";
import { model } from "../api/single-meal-generation-fixture.mjs";
import { draft } from "./meal-proposal-edit-api-fixture.mjs";
import { fixture as sqliteFixture } from "../../apps/mobile/tests/offline-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { MealProposalRuntime } from "../../apps/mobile/src/meals/proposal-runtime.ts";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  run = Effect.runPromise;
export { id };
export async function backend(t, lose = "edit") {
  const remote = await remoteFixture(t),
    sqlite = await sqliteFixture(t);
  const provider = model((value, index) => {
    if (index === 1 && value.meals)
      value.meals.forEach((e) => {
        e.choice = { kind: "suggested", recipe: draft };
      });
    return value;
  });
  const account = { actor: id(1), household: id(10) },
    session = await run(sqlite.store.activate(account, id(990)));
  const server = nodeServer(
    createHandler(
      { url: remote.url, publishableKey: "sb_publishable_fixture" },
      { model: provider.instance, planningSecret: Redacted.make(remote.serverKey) },
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
  const origin = `http://127.0.0.1:${server.address().port}/`,
    proxy = await lostResponseProxy(t, origin, `/v1/meals/proposal/${lose}`);
  const client = mealClient(
    proxy.url,
    account,
    Effect.succeed({ access_token: remote.bearer, refresh_token: "fixture", user: { id: id(1) } }),
  );
  let next = 800;
  const create = (store = sqlite.store) => {
    const runtime = new MealProposalRuntime(client, { store, session }, "2030-01-07", () =>
      id(next++),
    );
    t.after(() => runtime.dispose());
    return runtime;
  };
  return { remote, sqlite, provider, client, create, proxy, session };
}
