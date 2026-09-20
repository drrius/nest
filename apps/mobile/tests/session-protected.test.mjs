import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { protectedStorage, authKey } from "../src/session/protected-storage.ts";
import { sessionVerifier } from "../src/session/verification.ts";
import { SessionFailure } from "../src/session/contracts.ts";
const actor = "00000000-0000-4000-8000-000000000001";
const partner = "00000000-0000-4000-8000-000000000002";
const member = {
  userId: actor,
  householdId: "00000000-0000-4000-8000-000000000010",
  displayName: "A",
};
const credentials = {
  user: { id: actor },
  access_token: "fixture",
  refresh_token: "fixture-refresh",
  expires_at: 1,
};
function fixture() {
  const rows = new Map([[authKey, JSON.stringify(credentials)]]);
  const disk = {
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => {
      rows.set(key, value);
    },
    removeItem: async (key) => {
      rows.delete(key);
    },
  };
  return { rows, disk, ...protectedStorage(disk) };
}
const run = Effect.runPromise;
const offline = () => Effect.fail(new SessionFailure({ code: "unavailable" }));

test("legacy credentials round trip intact, only verified identity survives restart", async () => {
  const f = fixture();
  assert.deepEqual(JSON.parse(await f.storage.getItem(authKey)), credentials);
  assert.equal(await f.identity.read(), null);
  const verifier = sessionVerifier(
    () => Effect.succeed(member),
    () => {},
    f.identity,
  );
  await run(verifier.update(credentials));
  verifier.dispose();
  const restored = protectedStorage(f.disk);
  const states = [];
  const cold = sessionVerifier(offline, (state) => states.push(state), restored.identity);
  await run(cold.update(credentials));
  assert.deepEqual(states.at(-1), { status: "ready", member, offline: true });
  assert.deepEqual(JSON.parse(await restored.storage.getItem(authKey)), credentials);
});

test("SDK refresh retains identity, account replacement and logout erase it atomically", async () => {
  const f = fixture();
  await f.identity.save(member);
  await f.storage.setItem(authKey, JSON.stringify({ ...credentials, access_token: "rotated" }));
  assert.deepEqual(await f.identity.read(), member);
  await f.storage.setItem(authKey, JSON.stringify({ ...credentials, user: { id: partner } }));
  assert.equal(await f.identity.read(), null);
  await f.identity.save(member);
  assert.equal(await f.identity.read(), null, "delayed verification cannot attach another actor");
  await f.identity.save({ ...member, userId: partner });
  await f.storage.removeItem(authKey);
  assert.equal(await protectedStorage(f.disk).identity.read(), null);
  assert.equal(await f.storage.getItem(authKey), null);
});

for (const code of ["signed_out", "not_a_member"]) {
  test(`known ${code} removes persisted offline identity before subsequent outage`, async () => {
    const f = fixture();
    await f.identity.save(member);
    const states = [];
    const verifier = sessionVerifier(
      () => Effect.fail(new SessionFailure({ code })),
      (state) => states.push(state),
      f.identity,
    );
    await run(verifier.update(credentials));
    assert.equal(states.at(-1).status, code);
    const cold = sessionVerifier(
      offline,
      (state) => states.push(state),
      protectedStorage(f.disk).identity,
    );
    await run(cold.unavailable());
    assert.equal(states.at(-1).status, "unavailable");
  });
}

test("failed persistence blocks recovery and SDK credential removal still removes identity", async () => {
  const f = fixture();
  await f.identity.save(member);
  const broken = protectedStorage({
    ...f.disk,
    setItem: async () => {
      throw new Error("Keychain");
    },
  });
  await assert.rejects(broken.identity.clear());
  assert.equal(await broken.identity.read(), null);
  await broken.storage.removeItem(authKey);
  assert.equal(await protectedStorage(f.disk).identity.read(), null);
});

test("an old hydration cannot reopen a hidden or newly selected account", async () => {
  const f = fixture();
  await f.identity.save(member);
  let resolve;
  const delayed = new Promise((finish) => {
    resolve = finish;
  });
  const states = [];
  const verifier = sessionVerifier(offline, (state) => states.push(state), {
    ...f.identity,
    read: () => delayed,
  });
  const initial = run(verifier.unavailable());
  verifier.invalidate();
  resolve(member);
  await initial;
  assert.equal(states.length, 0);
  await run(verifier.update({ ...credentials, user: { id: partner } }));
  await run(verifier.unavailable());
  assert.equal(states.at(-1).status, "unavailable");
});

test("auxiliary SDK keys stay unchanged and malformed records never restore identity", async () => {
  const f = fixture();
  await f.storage.setItem("nest.auth.v1-code-verifier", "fixture-pkce");
  assert.equal(await f.storage.getItem("nest.auth.v1-code-verifier"), "fixture-pkce");
  f.rows.set(
    authKey,
    JSON.stringify({
      nestVersion: 2,
      session: credentials,
      member: { ...member, userId: partner },
    }),
  );
  assert.equal(await f.identity.read(), null);
  f.rows.set(authKey, JSON.stringify({ nestVersion: 99, session: credentials, member }));
  assert.equal(await f.storage.getItem(authKey), null);
});

test("durable logout intent survives a crash and rejects late token refresh writes", async () => {
  const f = fixture();
  await f.identity.save(member);
  const current = protectedStorage(f.disk);
  await current.beginLogout();
  await assert.rejects(current.storage.setItem(authKey, JSON.stringify(credentials)));
  const restarted = protectedStorage(f.disk);
  assert.equal(await restarted.storage.getItem(authKey), null);
  assert.equal(await restarted.identity.read(), null);
  await assert.rejects(restarted.storage.setItem(authKey, JSON.stringify(credentials)));
  await restarted.beginSignIn();
  await restarted.storage.setItem(authKey, JSON.stringify(credentials));
  assert.equal(
    await restarted.identity.read(),
    null,
    "new sign-in requires membership verification",
  );
  await restarted.identity.save(member);
  assert.deepEqual(await restarted.identity.read(), member);
});

test("known denial cannot reopen warm identity while protected cleanup is pending", async () => {
  const f = fixture();
  await f.identity.save(member);
  let clearStarted,
    finishClear,
    denied = false;
  const started = new Promise((resolve) => {
    clearStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    finishClear = resolve;
  });
  const states = [];
  const identity = {
    ...f.identity,
    clear: async () => {
      const cleared = f.identity.clear();
      clearStarted();
      await gate;
      await cleared;
    },
  };
  const verifier = sessionVerifier(
    () =>
      denied ? Effect.fail(new SessionFailure({ code: "not_a_member" })) : Effect.succeed(member),
    (state) => states.push(state),
    identity,
  );
  await run(verifier.update(credentials));
  denied = true;
  const pending = run(verifier.update(credentials));
  await started;
  await run(verifier.unavailable());
  assert.notEqual(states.at(-1).status, "ready");
  finishClear();
  await pending;
});

test("malformed JSON permits explicit sign-in replacement and logout cleanup", async () => {
  const f = fixture();
  f.rows.set(authKey, "{broken json");
  assert.equal(await f.identity.read(), null);
  assert.equal(await f.storage.getItem(authKey), null);
  await f.beginSignIn();
  await f.storage.setItem(authKey, JSON.stringify(credentials));
  await f.identity.save(member);
  assert.deepEqual(await f.identity.read(), member);
  f.rows.set(authKey, "{broken again");
  await f.beginLogout();
  await f.storage.removeItem(authKey);
  assert.equal(f.rows.has(authKey), false);
});
