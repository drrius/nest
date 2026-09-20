import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { choreTransferFiles } from "../../../../tests/database/chore-transfer-files.mjs";
import { choreClient } from "../../src/chores/client.ts";
import { choreFlow } from "../../src/chores/flow.ts";
import { choreRuntime } from "../../src/chores/runtime.ts";
import { routineClient } from "../../src/routines/client.ts";
import { fixture, run } from "../offline-fixture.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function serve(t, url) {
  const server = nodeServer(createHandler({ url, publishableKey: "sb_publishable_fixture" }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}/`;
}
export async function transferFixture(t, lostActor = 1) {
  const remote = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_chore_transfer");
  const direct = await serve(t, remote.url),
    lossy = await serve(t, proxy.url);
  const credentials = (actor) =>
    Effect.succeed({
      user: { id: id(actor) },
      access_token: actor === 1 ? remote.bearer : remote.partnerBearer,
    });
  const account = (actor) => ({ actor: id(actor), household: id(10) });
  const routines = routineClient(direct, account(1), credentials(1));
  const created = await run(
    routines.create({
      operationId: id(100),
      definition: {
        title: "Share this chore",
        schedule: { kind: "daily" },
        assignment: { policy: "alternating", anchorMemberId: id(1) },
      },
    }),
  );
  async function device(actor) {
    const local = await fixture(t),
      session = await run(local.store.activate(account(actor), id(90 + actor)));
    const client = choreClient(
      actor === lostActor ? lossy : direct,
      account(actor),
      credentials(actor),
    );
    const views = [],
      runtime = choreRuntime(choreFlow(local.store, session, client), (view) => views.push(view));
    t.after(() => runtime.dispose());
    await runtime.refresh();
    assert.equal(views.at(-1).stale, false);
    return { runtime, view: () => views.at(-1), store: local.store, session };
  }
  return { remote, proxy, routines, created, owner: await device(1), partner: await device(2) };
}
