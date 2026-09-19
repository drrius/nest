import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { SessionFailure } from "../src/session/contracts.ts";
import { sessionVerifier, verifySession } from "../src/session/verification.ts";
import { sessionConfig } from "../src/session/config.ts";
import { subscribeSession } from "../src/session/subscription.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const partner = "00000000-0000-4000-8000-000000000002";
const household = "00000000-0000-4000-8000-000000000010";
const member = { userId: actor, householdId: household, displayName: "A" };
const credentials = { access_token: "fixture", user: { id: actor } };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("native session verification uses bearer identity and rejects a mismatched stored actor", async () => {
  let header;
  const verify = (value) =>
    Effect.runPromise(
      verifySession("https://nest.example/", value).pipe(
        Effect.provideService(FetchHttpClient.Fetch, async (_url, options) => {
          header = new Headers(options.headers).get("authorization");
          return Response.json({ version: 1, member });
        }),
      ),
    );
  assert.deepEqual(await verify(credentials), member);
  assert.equal(header, "Bearer fixture");
  await assert.rejects(verify({ ...credentials, user: { id: partner } }), { code: "unavailable" });
});

test("denial, expiry, malformed responses and outages do not become verified sessions", async () => {
  for (const [status, body, code] of [
    [401, {}, "signed_out"],
    [403, {}, "not_a_member"],
    [503, { secret: "internal" }, "unavailable"],
    [200, { version: 1, member: { ...member, householdId: "bad" } }, "unavailable"],
  ]) {
    await assert.rejects(
      Effect.runPromise(
        verifySession("https://nest.example/", credentials).pipe(
          Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(body, { status })),
        ),
      ),
      { code },
    );
  }
});

test("an older member response cannot replace a newer account", async () => {
  const old = deferred();
  const states = [];
  const verifier = sessionVerifier(
    (input) =>
      input.user.id === actor
        ? Effect.promise(() => old.promise)
        : Effect.succeed({ ...member, userId: partner }),
    (value) => states.push(value),
  );
  const pending = Effect.runPromise(verifier.update(credentials));
  await Effect.runPromise(verifier.update({ ...credentials, user: { id: partner } }));
  old.resolve(member);
  await pending;
  assert.deepEqual(states.at(-1), { status: "ready", member: { ...member, userId: partner } });
  assert.equal(states.filter((state) => state.status === "ready").length, 1);
});

test("logout and disposal invalidate in-flight verification without publishing old private identity", async () => {
  const old = deferred();
  const states = [];
  const verifier = sessionVerifier(
    () => Effect.promise(() => old.promise),
    (value) => states.push(value),
  );
  const pending = Effect.runPromise(verifier.update(credentials));
  await Effect.runPromise(verifier.update(null));
  old.resolve(member);
  await pending;
  assert.deepEqual(states.at(-1), { status: "signed_out" });
  verifier.dispose();
  const count = states.length;
  await Effect.runPromise(verifier.update(credentials));
  assert.equal(states.length, count);
});

test("a superseded membership denial cannot sign out the next account", async () => {
  const old = deferred();
  const states = [];
  const verifier = sessionVerifier(
    (input) =>
      input.user.id === actor
        ? Effect.promise(() => old.promise).pipe(
            Effect.flatMap(() => Effect.fail(new SessionFailure({ code: "not_a_member" }))),
          )
        : Effect.succeed({ ...member, userId: partner }),
    (value) => states.push(value),
  );
  const pending = Effect.runPromise(verifier.update(credentials));
  await Effect.runPromise(verifier.update({ ...credentials, user: { id: partner } }));
  old.resolve();
  await pending;
  assert.equal(states.at(-1).member.userId, partner);
});

test("an in-flight SDK hydration cannot restore visibility after sign-out starts", async () => {
  const hydration = deferred();
  const states = [];
  const auth = {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getSession: () => hydration.promise,
    stopAutoRefresh: async () => {},
  };
  const subscription = subscribeSession(
    auth,
    () => Effect.succeed(member),
    (value) => states.push(value),
  );
  subscription.hide();
  hydration.resolve({ data: { session: credentials }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(states, [{ status: "logout_pending" }]);
  subscription.dispose();
});

test("native configuration rejects server secrets, unsafe origins and release HTTP", () => {
  const input = {
    supabaseUrl: "https://database.example",
    apiUrl: "https://api.example",
    publishableKey: "sb_publishable_fixture",
  };
  assert.equal(sessionConfig(input, false).apiUrl, "https://api.example/");
  assert.equal(sessionConfig({}, false), null);
  assert.throws(() => sessionConfig({ ...input, publishableKey: "sb_secret_no" }, true));
  for (const apiUrl of [
    "http://remote.example",
    "https://user:password@example.com",
    "https://example.com/path",
    "http://localhost",
  ]) {
    assert.throws(() => sessionConfig({ ...input, apiUrl }, false));
  }
});

test("refresh events cannot reopen a hidden session until an explicit sign-in succeeds", async () => {
  let notify;
  const states = [];
  const auth = {
    onAuthStateChange(callback) {
      notify = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    stopAutoRefresh: async () => {},
  };
  const subscription = subscribeSession(
    auth,
    () => Effect.succeed(member),
    (state) => states.push(state),
  );
  subscription.hide();
  notify("TOKEN_REFRESHED", credentials);
  notify("SIGNED_OUT", null);
  subscription.unavailable();
  await subscription.refresh();
  assert.deepEqual(states.at(-1), { status: "logout_pending" });
  subscription.finishSignOut();
  assert.deepEqual(states.at(-1), { status: "signed_out" });
  subscription.signIn(credentials);
  await Promise.resolve();
  assert.deepEqual(states.at(-1), { status: "ready", member });
  subscription.dispose();
});
