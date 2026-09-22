import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./renewal-native-fixture.mjs";
import { renewalReadOperations } from "../../apps/mobile/src/renewals/read-operations.ts";
import { RenewalReadRuntime } from "../../apps/mobile/src/renewals/read-runtime.ts";
test("renewal reader loads retained details, clears background data and refuses a replaced account", async (t) => {
  const f = await fixture(t);
  const saved = await run(f.native.save(f.command));
  const runtime = new RenewalReadRuntime(
    renewalReadOperations({ store: f.local.store, session: f.session }, f.native),
    { kind: "list", after: null },
  );
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry.data.renewals.length, 1);
  await runtime.select({ kind: "detail", renewalId: f.command.renewalId });
  assert.deepEqual(runtime.getSnapshot().entry.data.renewal, saved.renewal);
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setActive(true);
  assert.deepEqual(runtime.getSnapshot().entry.data.renewal, saved.renewal);
  await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().entry, null);
});
test("late renewal reads cannot restore data after backgrounding or disposal", async (t) => {
  const f = await fixture(t);
  await run(f.native.save(f.command));
  const base = renewalReadOperations({ store: f.local.store, session: f.session }, f.native);
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const { Effect } = await import("./renewal-fixture.mjs");
  const runtime = new RenewalReadRuntime(
    {
      read: (target) =>
        base.read(target).pipe(
          Effect.flatMap((entry) =>
            Effect.promise(async () => {
              entered();
              await wait;
              return entry;
            }),
          ),
        ),
    },
    { kind: "list", after: null },
  );
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  const pending = runtime.setActive(true);
  await started;
  await runtime.setActive(false);
  release();
  await pending;
  assert.equal(runtime.getSnapshot().entry, null);
  runtime.dispose();
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry, null);
});
