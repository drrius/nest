import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { sdkFixture } from "./session-sdk-fixture.mjs";
import { signOutSession } from "../src/session/sign-out.ts";
import { subscribeSession } from "../src/session/subscription.ts";

test("the pinned auth SDK removes persisted credentials on local logout even when revocation is unavailable", async () => {
  const { client, storage, calls, user } = sdkFixture();
  const restored = await client.auth.getSession();
  assert.equal(restored.data.session.user.id, user.id);
  const result = await client.auth.signOut({ scope: "local" });
  assert.ok(result.error);
  assert.ok(calls.some((url) => String(url).includes("/logout?scope=local")));
  assert.equal(storage.has("nest.auth.v1"), false);
  assert.equal((await client.auth.getSession()).data.session, null);
  await client.auth.stopAutoRefresh();
});

for (const failure of ["read", "delete"]) {
  test(`failed Keychain ${failure} keeps logout pending and permits successful cleanup retry`, async () => {
    const fixture = sdkFixture();
    const { client, storage, user } = fixture;
    await client.auth.getSession();
    const states = [];
    const subscription = subscribeSession(
      client.auth,
      () => Effect.succeed({ userId: user.id, householdId: "fixture", displayName: "A" }),
      (state) => states.push(state),
    );
    await subscription.refresh();
    fixture.fail(failure);
    try {
      await assert.rejects(Effect.runPromise(signOutSession(client.auth, subscription)), {
        code: "unavailable",
      });
      assert.equal(storage.has("nest.auth.v1"), true);
      assert.deepEqual(states.at(-1), { status: "logout_pending" });
      await subscription.refresh();
      await subscription.unavailable();
      assert.deepEqual(states.at(-1), { status: "logout_pending" });
      fixture.fail(null);
      await Effect.runPromise(signOutSession(client.auth, subscription));
      assert.equal(storage.has("nest.auth.v1"), false);
      assert.equal((await client.auth.getSession()).data.session, null);
      assert.deepEqual(states.at(-1), { status: "signed_out" });
    } finally {
      fixture.fail(null);
      subscription.dispose();
    }
  });
}
