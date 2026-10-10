import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { protectedStorage, authKey } from "../src/session/protected-storage.ts";
import { pushLogoutCleanup } from "../src/push/logout-cleanup.ts";
import { createClient } from "@supabase/supabase-js";
import { refreshLogoutCredentials } from "../src/session/refresh-logout.ts";
import { sdkFixture } from "./session-sdk-fixture.mjs";
import { signOutSession } from "../src/session/sign-out.ts";
const actor = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const token = (exp, sub = actor, session_id = sessionId) =>
  `${encode({ alg: "HS256" })}.${encode({ sub, session_id, exp })}.fixture`;
const session = (expires_at = 1) => ({
  user: { id: actor },
  access_token: token(expires_at),
  refresh_token: "old",
  expires_at,
});
function setup() {
  let raw = JSON.stringify(session()),
    fail = false;
  const disk = {
    getItem: async () => raw,
    setItem: async (_, value) => {
      if (fail) throw new Error("locked");
      raw = value;
    },
    removeItem: async () => {
      raw = null;
    },
  };
  const storage = protectedStorage(disk);
  return {
    disk,
    storage,
    raw: () => raw,
    fail: () => {
      fail = true;
    },
  };
}

test("expired logout refresh persists before revoke and restart retries without restoring identity", async () => {
  const f = setup();
  await f.storage.beginLogout(true);
  const replacement = { ...session(5000), refresh_token: "rotated" };
  let refreshes = 0,
    revokes = 0;
  const deps = {
    credentials: f.storage.logoutCredentials,
    now: () => 1000,
    refresh: () =>
      Effect.sync(() => {
        refreshes++;
        return replacement;
      }),
    revoke: (access) =>
      Effect.promise(async () => {
        revokes++;
        assert.equal(access, replacement.access_token);
        assert.equal(JSON.parse(f.raw()).session.refresh_token, "rotated");
        assert.equal(JSON.parse(f.raw()).cleanupRequired, true);
        assert.equal(await f.storage.storage.getItem(authKey), null);
        throw new Error("offline");
      }),
  };
  await assert.rejects(Effect.runPromise(pushLogoutCleanup(deps)));
  const restarted = protectedStorage(f.disk);
  assert.equal(await restarted.identity.read(), null);
  const done = await Effect.runPromise(
    pushLogoutCleanup({
      ...deps,
      credentials: restarted.logoutCredentials,
      revoke: () =>
        Effect.sync(() => {
          revokes++;
          return { version: 1, actorId: actor, sessionId, revoked: true };
        }),
    }),
  );
  assert.equal(done, replacement.access_token);
  assert.equal(refreshes, 1);
  assert.equal(revokes, 2);
});

test("pending credential refresh rejects identity changes, stale replacement and locked storage", async () => {
  const f = setup();
  await f.storage.beginLogout();
  const before = await f.storage.logoutCredentials.read();
  for (const access of [token(5000, sessionId), token(5000, actor, actor), "broken"])
    await assert.rejects(
      f.storage.logoutCredentials.replace(before, { ...session(5000), access_token: access }),
    );
  await f.storage.logoutCredentials.replace(before, session(5000));
  await assert.rejects(f.storage.logoutCredentials.replace(before, session(6000)), /changed/);
  const current = await f.storage.logoutCredentials.read();
  f.fail();
  let dispatched = false;
  await assert.rejects(
    Effect.runPromise(
      pushLogoutCleanup({
        credentials: f.storage.logoutCredentials,
        now: () => 6000,
        refresh: () => Effect.succeed(session(9000)),
        revoke: () =>
          Effect.sync(() => {
            dispatched = true;
          }),
      }),
    ),
  );
  assert.equal(dispatched, false);
  assert.deepEqual(await f.storage.logoutCredentials.read(), current);
});

test("pinned SDK refresh uses retained credentials without hydrating the signed-out app", async () => {
  const f = setup();
  await f.storage.beginLogout();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const replacement = {
    ...session(expires),
    refresh_token: "sdk-rotated",
    expires_in: 3600,
    token_type: "bearer",
  };
  let refreshes = 0;
  const { auth } = createClient("https://fixture.example", "sb_publishable_fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, init) => {
        if (typeof url !== "string") throw new Error("Expected SDK URL string");
        assert.match(url, /\/auth\/v1\/token\?grant_type=refresh_token$/);
        assert.equal(JSON.parse(init.body).refresh_token, "old");
        refreshes++;
        return Response.json(replacement);
      },
    },
  });
  const result = await Effect.runPromise(
    pushLogoutCleanup({
      credentials: f.storage.logoutCredentials,
      now: () => Math.floor(Date.now() / 1000),
      refresh: (value) => refreshLogoutCredentials(auth, value),
      revoke: (value) =>
        Effect.promise(async () => {
          assert.equal(value, replacement.access_token);
          assert.equal(await f.storage.storage.getItem(authKey), null);
          assert.equal(await f.storage.identity.read(), null);
          assert.equal(JSON.parse(f.raw()).session.refresh_token, "sdk-rotated");
          return { version: 1, actorId: actor, sessionId, revoked: true };
        }),
    }),
  );
  assert.equal(result, replacement.access_token);
  assert.equal(refreshes, 1);
  await auth.stopAutoRefresh();
});

test("required cleanup survives restart and blocks SDK deletion and replacement sign-in", async () => {
  const f = setup();
  const access = await f.storage.beginLogout(true);
  const restarted = protectedStorage(f.disk);
  await assert.rejects(restarted.storage.removeItem(authKey), /cleanup required/);
  await assert.rejects(restarted.beginSignIn(), /cleanup required/);
  await assert.rejects(restarted.logoutCredentials.complete("wrong token"), /changed/);
  assert.equal(await restarted.storage.getItem(authKey), null);
  assert.equal(await restarted.identity.read(), null);
  await restarted.logoutCredentials.complete(access);
  await restarted.storage.removeItem(authKey);
  await restarted.beginSignIn();
  assert.equal(f.raw(), null);
});

test("SDK rotations during cleanup stay hidden and cannot switch identity or restore a removed session", async () => {
  const f = setup();
  await f.storage.beginLogout(true);
  for (const access of [token(5000, sessionId), token(5000, actor, actor), "broken"])
    await assert.rejects(
      f.storage.storage.setItem(
        authKey,
        JSON.stringify({ ...session(5000), access_token: access }),
      ),
    );
  await f.storage.storage.setItem(authKey, JSON.stringify(session(5000)));
  assert.equal(await f.storage.storage.getItem(authKey), null);
  assert.equal(await f.storage.identity.read(), null);
  assert.equal(JSON.parse(f.raw()).cleanupRequired, true);
  await f.storage.logoutCredentials.complete(session(5000).access_token);
  await f.storage.storage.removeItem(authKey);
  await assert.rejects(
    f.storage.storage.setItem(authKey, JSON.stringify(session(6000))),
    /logout pending/,
  );
  assert.equal(f.raw(), null);
});

test("actual SDK cannot remove required pending cleanup and succeeds after verified cleanup", async () => {
  const f = sdkFixture({ wrapStorage: protectedStorage });
  await f.client.auth.getSession();
  const events = [];
  const subscription = {
    hide: () => events.push("hidden"),
    finishSignOut: () => events.push("done"),
  };
  await assert.rejects(
    Effect.runPromise(
      signOutSession(
        f.client.auth,
        subscription,
        () => f.beginLogout(true),
        async () => {
          throw new Error("offline");
        },
      ),
    ),
  );
  await assert.rejects(f.client.auth.signOut({ scope: "local" }), /cleanup required/);
  assert.equal(JSON.parse(f.storage.get(authKey)).cleanupRequired, true);
  assert.equal((await f.client.auth.getSession()).data.session, null);
  await Effect.runPromise(
    signOutSession(
      f.client.auth,
      subscription,
      () => f.beginLogout(true),
      async (access) => {
        await f.logoutCredentials.complete(access);
        return access;
      },
    ),
  );
  assert.equal(events.at(-1), "done");
  assert.equal(f.storage.has(authKey), false);
  await f.client.auth.stopAutoRefresh();
});
