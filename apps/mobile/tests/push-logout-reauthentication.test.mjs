import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { protectedStorage, authKey } from "../src/session/protected-storage.ts";
import { reauthenticatePushLogout } from "../src/push/logout-reauthentication.ts";
import { SessionFailure } from "../src/session/contracts.ts";
const actor = "00000000-0000-4000-8000-000000000001",
  partner = "00000000-0000-4000-8000-000000000002";
const oldId = "00000000-0000-4000-8000-000000000003",
  newId = "00000000-0000-4000-8000-000000000004";
const token = (sub, session_id) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub, session_id })).toString("base64url")}.fixture`;
const old = {
  user: { id: actor },
  access_token: token(actor, oldId),
  refresh_token: "invalid-refresh",
  expires_at: 1,
};
const fresh = { user: { id: actor }, access_token: token(actor, newId) };
async function setup() {
  let raw = JSON.stringify(old);
  const disk = {
    getItem: async () => raw,
    setItem: async (_, value) => {
      raw = value;
    },
    removeItem: async () => {
      raw = null;
    },
  };
  const store = protectedStorage(disk);
  await store.beginLogout(true);
  return { store, raw: () => raw };
}

test("reauthentication revokes the retained session without publishing or persisting the fresh login", async () => {
  const f = await setup();
  let calls = 0;
  const result = await Effect.runPromise(
    reauthenticatePushLogout({
      credentials: f.store.logoutCredentials,
      authenticate: Effect.succeed(fresh),
      revoke: (current, previous) =>
        Effect.sync(() => {
          calls++;
          assert.equal(current, fresh.access_token);
          assert.equal(previous, old.access_token);
          assert.equal(JSON.parse(f.raw()).cleanupRequired, true);
          return { version: 1, actorId: actor, sessionId: oldId, revoked: true };
        }),
    }),
  );
  assert.equal(result, old.access_token);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(f.raw()).cleanupRequired, false);
  assert.deepEqual(JSON.parse(f.raw()).session, old);
  assert.equal(await f.store.storage.getItem(authKey), null);
  assert.equal(await f.store.identity.read(), null);
  await f.store.beginLogout(true);
  const retry = await Effect.runPromise(
    reauthenticatePushLogout({
      credentials: f.store.logoutCredentials,
      authenticate: Effect.fail(new SessionFailure({ code: "cancelled" })),
      revoke: () => Effect.fail(new SessionFailure({ code: "unavailable" })),
    }),
  );
  assert.equal(
    retry,
    old.access_token,
    "local deletion retry does not need another Apple prompt or expired token refresh",
  );
  await f.store.storage.removeItem(authKey);
  assert.equal(f.raw(), null);
});

test("wrong Apple account, cancellation, failed revocation and forged receipts retain cleanup", async () => {
  const f = await setup();
  let calls = 0;
  const deps = {
    credentials: f.store.logoutCredentials,
    authenticate: Effect.succeed(fresh),
    revoke: () =>
      Effect.sync(() => {
        calls++;
        return { version: 1, actorId: actor, sessionId: newId, revoked: true };
      }),
  };
  await assert.rejects(
    Effect.runPromise(
      reauthenticatePushLogout({
        ...deps,
        authenticate: Effect.succeed({
          user: { id: partner },
          access_token: token(partner, newId),
        }),
      }),
    ),
  );
  await assert.rejects(
    Effect.runPromise(
      reauthenticatePushLogout({
        ...deps,
        authenticate: Effect.fail(new SessionFailure({ code: "cancelled" })),
      }),
    ),
  );
  assert.equal(calls, 0);
  await assert.rejects(Effect.runPromise(reauthenticatePushLogout(deps)));
  await assert.rejects(
    Effect.runPromise(
      reauthenticatePushLogout({
        ...deps,
        revoke: () => Effect.fail(new SessionFailure({ code: "unavailable" })),
      }),
    ),
  );
  assert.equal(JSON.parse(f.raw()).cleanupRequired, true);
  await assert.rejects(f.store.storage.removeItem(authKey));
  await assert.rejects(f.store.beginSignIn());
});
