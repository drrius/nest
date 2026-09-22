import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PushEnrollmentRuntime } from "../../apps/mobile/src/push/enrollment-runtime.ts";
import { pushDeviceClient } from "../../apps/mobile/src/push/client.ts";
import { protectedPushAttempts } from "../../apps/mobile/src/push/protected-attempt.ts";
import { fixture, id, Effect, Fetch } from "./renewal-fixture.mjs";

test("settings controller reads and changes real authorized registration through HTTP", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260922223732_native_push_registration.sql",
    "supabase/migrations/20260922230403_native_push_logout.sql",
  ]);
  const account = { actor: id(1), household: id(10) };
  const values = new Map();
  const store = protectedPushAttempts({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  });
  const raw = pushDeviceClient(
    f.url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    (input) => Effect.sync(() => createHash("sha256").update(input).digest("hex")),
  );
  const counters = { posts: 0, prompts: 0, operation: 1200 };
  const transport = async (input, init) => {
    if (init?.method === "POST") {
      counters.posts++;
      assert.equal(values.size, 1);
    }
    return fetch(input, init);
  };
  const bind = (effect) => effect.pipe(Effect.provideService(Fetch.Fetch, transport));
  const deps = {
    account,
    store,
    client: {
      detail: (input) => bind(raw.detail(input)),
      save: (input) => bind(raw.save(input)),
      recover: (input) => bind(raw.recover(input)),
    },
    installation: Effect.succeed(id(1199)),
    readInstallation: Effect.succeed(id(1199)),
    permission: Effect.succeed({ status: "allowed", canAskAgain: true }),
    token: Effect.sync(() => {
      counters.prompts++;
      return "ExponentPushToken[ControllerFixture]";
    }),
    operationId: () => id(counters.operation++),
  };
  const runtime = new PushEnrollmentRuntime(deps);
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().enabled, false);
  assert.equal(counters.posts, 0);
  assert.equal(counters.prompts, 0);
  await runtime.enable();
  assert.equal(runtime.getSnapshot().enabled, true);
  assert.equal(counters.posts, 1);
  assert.equal(counters.prompts, 1);
  await runtime.load();
  assert.equal(counters.posts, 1);
  await runtime.disable();
  assert.equal(runtime.getSnapshot().enabled, false);
  assert.equal(counters.posts, 2);
  assert.equal(counters.prompts, 1);
  assert.equal(values.size, 0);
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_devices where token is not null"),
    "0",
  );
});
