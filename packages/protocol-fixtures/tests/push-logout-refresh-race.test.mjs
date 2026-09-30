import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { sdkFixture } from "./session-sdk-fixture.mjs";
import { protectedStorage, authKey } from "../src/session/protected-storage.ts";
import { refreshLogoutCredentials } from "../src/session/refresh-logout.ts";
import { pushLogoutCleanup } from "../src/push/logout-cleanup.ts";
import { signOutSession } from "../src/session/sign-out.ts";
import { isAuthRefreshDiscardedError } from "@supabase/supabase-js";

test("logout joins an in-flight SDK refresh and keeps its rotation hidden until revocation", async () => {
  const actor = "00000000-0000-4000-8000-000000000001",
    sessionId = "00000000-0000-4000-8000-000000000009";
  const exp = Math.floor(Date.now() / 1000) + 10800;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const replacement = {
    user: { id: actor },
    token_type: "bearer",
    expires_in: 10800,
    access_token: `${encode({ alg: "HS256" })}.${encode({ sub: actor, session_id: sessionId, exp })}.fixture`,
    refresh_token: "rotated-once",
    expires_at: exp,
  };
  let release, entered;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let sends = 0;
  const f = sdkFixture({
    wrapStorage: protectedStorage,
    fetcher: async (url) => {
      if (!url.includes("/token?")) return new Response(null, { status: 204 });
      sends++;
      entered();
      await pending;
      return Response.json(replacement);
    },
  });
  await f.client.auth.getSession();
  const ordinary = f.client.auth.refreshSession({ refresh_token: "fixture-refresh" });
  await started;
  let finished = false,
    revoked = false;
  const cleanup = signOutSession(
    f.client.auth,
    {
      hide: () => {},
      finishSignOut: () => {
        finished = true;
      },
    },
    () => f.beginLogout(true),
    async () => {
      const job = pushLogoutCleanup({
        credentials: f.logoutCredentials,
        now: () => Date.now() / 1000 + 7200,
        refresh: (token) =>
          Effect.promise(() => {
            const joining = Effect.runPromise(refreshLogoutCredentials(f.client.auth, token));
            setImmediate(() => release());
            return joining;
          }),
        revoke: (token) =>
          Effect.promise(async () => {
            assert.equal(token, replacement.access_token);
            assert.equal(JSON.parse(f.storage.get(authKey)).session.refresh_token, "rotated-once");
            assert.equal((await f.client.auth.getSession()).data.session, null);
            assert.equal(await f.identity.read(), null);
            revoked = true;
            return { version: 1, actorId: actor, sessionId, revoked: true };
          }),
      });
      const operation = Effect.runPromise(job);
      const token = await operation;
      await f.logoutCredentials.complete(token);
      return token;
    },
  );
  await Effect.runPromise(cleanup);
  assert.equal(isAuthRefreshDiscardedError((await ordinary).error), true);
  assert.equal(sends, 2, "discarded in-flight refresh completes before one parent-token retry");
  assert.equal(revoked, true);
  assert.equal(finished, true);
  assert.equal(f.storage.has(authKey), false);
});
