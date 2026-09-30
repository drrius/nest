import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { fixture, account, grocery, run } from "./offline-fixture.mjs";
import { protectedStorage, authKey } from "../src/session/protected-storage.ts";
import { sessionVerifier } from "../src/session/verification.ts";
import { SessionFailure } from "../src/session/contracts.ts";

test("restored offline identity opens only its own durable queue after SQLite restart", async (t) => {
  const db = await fixture(t);
  await run(db.store.enqueue(db.session, grocery));
  const rows = new Map();
  const disk = {
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => {
      rows.set(key, value);
    },
    removeItem: async (key) => {
      rows.delete(key);
    },
  };
  const first = protectedStorage(disk);
  await first.storage.setItem(
    authKey,
    JSON.stringify({
      access_token: "expired-fixture",
      refresh_token: "fixture",
      expires_at: 1,
      user: { id: account.actor },
    }),
  );
  await first.identity.save({
    userId: account.actor,
    householdId: account.household,
    displayName: "A",
  });
  const restarted = db.reopen();
  await run(restarted.store.initialize);
  let state;
  const verifier = sessionVerifier(
    () => Effect.fail(new SessionFailure({ code: "unavailable" })),
    (next) => {
      state = next;
    },
    protectedStorage(disk).identity,
  );
  await run(verifier.unavailable());
  assert.equal(state.status, "ready");
  const own = await run(
    restarted.store.activate(
      { actor: state.member.userId, household: state.member.householdId },
      "30000000-0000-4000-8000-000000000002",
    ),
  );
  assert.equal((await run(restarted.store.read(own))).pending.length, 1);
  const partner = await run(
    restarted.store.activate(
      { ...account, actor: "10000000-0000-4000-8000-000000000002" },
      "30000000-0000-4000-8000-000000000003",
    ),
  );
  assert.equal((await run(restarted.store.read(partner))).pending.length, 0);
  await assert.rejects(run(restarted.store.read(own)), { reason: "session_changed" });
});
