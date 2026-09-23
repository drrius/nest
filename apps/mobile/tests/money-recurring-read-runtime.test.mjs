import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { RecurringReadRuntime } from "../src/money/recurring-read-runtime.ts";
import { recurringReadOwner } from "../src/money/recurring-read-owner.ts";
import { recurringReadOperations } from "../src/money/recurring-read-operations.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, account, run } from "./offline-fixture.mjs";
const target = { kind: "list", after: null };
const entry = { kind: "list", value: { rules: [] } };
async function open(runtime) {
  await runtime.setOnline(true);
  await runtime.setActive(true);
}
test("read lifecycle suppresses late pages, clears private data and reconnects with reads only", async () => {
  let resolve,
    calls = 0;
  const runtime = new RecurringReadRuntime(
    {
      read: () => {
        calls++;
        return Effect.promise(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        );
      },
    },
    target,
  );
  await runtime.setOnline(true);
  const first = runtime.setActive(true);
  await runtime.setActive(false);
  resolve(entry);
  await first;
  assert.equal(runtime.getSnapshot().entry, null);
  const second = runtime.setActive(true);
  resolve(entry);
  await second;
  assert.deepEqual(runtime.getSnapshot().entry, entry);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  const reconnect = runtime.setOnline(true);
  resolve(entry);
  await reconnect;
  assert.equal(calls, 3);
  runtime.dispose();
  assert.equal(runtime.getSnapshot().entry, null);
});
test("failed pages stay hidden while authorization is rechecked on foreground and retry", async () => {
  let fail = false,
    calls = 0;
  const runtime = new RecurringReadRuntime(
    {
      read: () => {
        calls++;
        return fail ? Effect.fail(new PreferenceFailure({ code: fail })) : Effect.succeed(entry);
      },
    },
    target,
  );
  await open(runtime);
  fail = "unavailable";
  await runtime.select({ kind: "list", after: "next" });
  assert.equal(runtime.getSnapshot().entry, null);
  assert.match(runtime.getSnapshot().notice, /Could not load/);
  fail = false;
  await runtime.refresh();
  assert.deepEqual(runtime.getSnapshot().entry, entry);
  fail = "forbidden";
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  const before = calls;
  await runtime.setActive(false);
  await runtime.setActive(true);
  await runtime.refresh();
  assert.equal(calls, before + 2);
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().entry, null);
  fail = false;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, false);
  assert.deepEqual(runtime.getSnapshot().entry, entry);
  runtime.dispose();
});
test("lease replacement during an in-flight authorized read prevents data publication", async (t) => {
  const local = await fixture(t);
  const operations = recurringReadOperations(
    { store: local.store, session: local.session },
    {
      recurringRules: () =>
        Effect.gen(function* () {
          yield* local.store.activate(account, "30000000-0000-4000-8000-000000000002");
          return { rules: [] };
        }),
    },
  );
  const runtime = new RecurringReadRuntime(operations, target);
  await open(runtime);
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().entry, null);
  await assert.rejects(run(local.store.checkSession(local.session)));
  runtime.dispose();
});
test("mount ownership disposes the final subscriber and does not revive its runtime", async () => {
  const owner = recurringReadOwner({ read: () => Effect.succeed(entry) }, target);
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await open(first);
  stop();
  assert.equal(first.getSnapshot().entry, null);
  assert.equal(owner.getSnapshot(), null);
  const stopAgain = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  assert.equal(owner.getSnapshot().getSnapshot().entry, null);
  stopAgain();
});
