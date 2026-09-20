import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { sdkFixture } from "./session-sdk-fixture.mjs";
import { protectedStorage } from "../src/session/protected-storage.ts";
import { subscribeSession } from "../src/session/subscription.ts";
import { SessionFailure } from "../src/session/contracts.ts";
import { signOutSession } from "../src/session/sign-out.ts";
const householdId = "00000000-0000-4000-8000-000000000010";

for (const expired of [false, true]) {
  test(`cold SDK restoration ${expired ? "with expired token" : "with valid token"} keeps offline data and logout removes it`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    const f = sdkFixture({
      expiresIn: expired ? -3600 : 3600,
      wrapStorage: protectedStorage,
      fetcher: () => {
        // Advance the SDK's retry deadline without sleeping. This exercises the
        // real retryable response classification and persisted-session behavior.
        t.mock.timers.tick(31000);
        return Response.json({ message: "Unavailable" }, { status: 503 });
      },
    });
    const member = { userId: f.user.id, householdId, displayName: "A" };
    await f.identity.save(member);
    const states = [];
    const subscription = subscribeSession(
      f.client.auth,
      () => Effect.fail(new SessionFailure({ code: "unavailable" })),
      (state) => states.push(state),
      f.identity,
    );
    t.after(() => subscription.dispose());
    await subscription.refresh();
    assert.deepEqual(states.at(-1), { status: "ready", member, offline: true });
    assert.ok(f.storage.has("nest.auth.v1"));
    if (expired) assert.ok(f.calls.some((url) => String(url).includes("/token")));
    await Effect.runPromise(signOutSession(f.client.auth, subscription, f.beginLogout));
    assert.deepEqual(states.at(-1), { status: "signed_out" });
    assert.equal(f.storage.has("nest.auth.v1"), false);
    assert.equal(await f.identity.read(), null);
  });
}

test("definitively rejected expired credentials cannot recover the cached identity", async (t) => {
  const f = sdkFixture({
    expiresIn: -3600,
    wrapStorage: protectedStorage,
    fetcher: () =>
      Response.json(
        { code: "refresh_token_not_found", message: "Invalid refresh token" },
        { status: 400 },
      ),
  });
  await f.identity.save({ userId: f.user.id, householdId, displayName: "A" });
  const states = [];
  const subscription = subscribeSession(
    f.client.auth,
    () => assert.fail("Rejected credentials must not reach membership verification"),
    (state) => states.push(state),
    f.identity,
  );
  t.after(() => subscription.dispose());
  await subscription.refresh();
  assert.equal(states.at(-1).status, "signed_out");
  assert.equal(await f.identity.read(), null);
});
