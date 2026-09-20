import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { setupClient } from "../src/setup/client.ts";
import { SetupRuntime } from "../src/setup/runtime.ts";
import { setupOwner } from "../src/setup/owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const status = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  foodConfigured: false,
  cookingConfigured: true,
  notificationsConfigured: false,
};
const client = setupClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("setup client binds private status to actor/household and rejects incomplete or private payloads", async () => {
  assert.deepEqual(
    await run(client.read(), async (_url, init) => {
      assert.equal(init.method, "GET");
      assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
      return Response.json(status);
    }),
    status,
  );
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { foodConfigured: null },
    { content: "private" },
  ])
    await assert.rejects(
      run(client.read(), async () => Response.json({ ...status, ...change })),
      { code: "unavailable" },
    );
  const other = setupClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "other" }),
  );
  await assert.rejects(
    run(other.read(), async () => assert.fail("wrong account dispatched")),
    { code: "session" },
  );
});
test("setup refresh reflects saved forms; failures stay unknown and authorization denial is sticky", async () => {
  /** @type {Effect.Effect<typeof status, PreferenceFailure>} */
  let effect = Effect.succeed(status);
  const runtime = new SetupRuntime({ read: () => effect });
  await runtime.load();
  assert.equal(runtime.getSnapshot().status.foodConfigured, false);
  effect = Effect.succeed({ ...status, foodConfigured: true });
  await runtime.load();
  assert.equal(runtime.getSnapshot().status.foodConfigured, true);
  effect = Effect.fail(new PreferenceFailure({ code: "forbidden" }));
  await runtime.load();
  assert.equal(runtime.getSnapshot().status, null);
  assert.equal(runtime.getSnapshot().verify, true);
  effect = Effect.fail(new PreferenceFailure({ code: "unavailable" }));
  await runtime.load();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().status, null);
  effect = Effect.succeed(status);
  await runtime.load();
  assert.equal(runtime.getSnapshot().verify, false);
  runtime.dispose();
});
test("canceled old setup reads cannot overwrite refreshed state or repopulate after disposal", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  const runtime = new SetupRuntime({
    read: () =>
      ++calls === 1
        ? Effect.promise(() => pending)
        : Effect.succeed({ ...status, foodConfigured: true }),
  });
  const old = runtime.load();
  await new Promise((resolve) => setImmediate(resolve));
  runtime.cancel();
  await runtime.load();
  finish(status);
  await old;
  assert.equal(runtime.getSnapshot().status.foodConfigured, true);
  runtime.dispose();
  await runtime.load();
  assert.equal(runtime.getSnapshot().status, null);
  assert.equal(calls, 2);
});
test("setup owner recreates a fresh runtime after StrictMode unsubscribe without automatic reads", async () => {
  let calls = 0;
  const owner = setupOwner({
    read: () => {
      calls++;
      return Effect.succeed(status);
    },
  });
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  assert.equal(calls, 0);
  await first.load();
  stop();
  assert.equal(owner.getSnapshot(), null);
  const stopAgain = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  await owner.getSnapshot().load();
  assert.equal(calls, 2);
  stopAgain();
});

test("a response finishing after setup disposal cannot publish old account status", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const runtime = new SetupRuntime({ read: () => Effect.promise(() => pending) });
  let publications = 0;
  runtime.subscribe(() => {
    publications++;
  });
  const load = runtime.load();
  await new Promise((resolve) => setImmediate(resolve));
  runtime.dispose();
  const before = publications;
  finish(status);
  await load;
  assert.equal(publications, before);
  assert.equal(runtime.getSnapshot().status, null);
});
