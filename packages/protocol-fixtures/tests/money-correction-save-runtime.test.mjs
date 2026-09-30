import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  command,
  attempt,
  receipt,
  result,
  run,
  Effect,
  account,
  id,
} from "./money-correction-save-fixture.mjs";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
const unavailable = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));
test("Save is explicit, stages before send, and cannot be duplicated while busy or acknowledged", async (t) => {
  const f = await fixture(t);
  let release;
  const runtime = await f.open(
    f.runtime({
      send: () =>
        Effect.tryPromise({
          try: async () => {
            assert.deepEqual(await run(f.operations.saved()), attempt);
            await new Promise((resolve) => {
              release = resolve;
            });
            return result("recorded");
          },
          catch: () => new PreferenceFailure({ code: "unavailable" }),
        }),
    }),
  );
  const saving = runtime.save(command);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await runtime.save({ ...command, operationId: id(200) });
  release();
  await saving;
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.equal(await run(f.operations.saved()), null);
  await runtime.save(command);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  runtime.acknowledge();
  assert.equal(runtime.getSnapshot().result, null);
});
test("restart and reconnect only read an unresolved Save; retry retains the exact operation", async (t) => {
  const f = await fixture(t),
    first = await f.open(f.runtime({ send: unavailable }));
  await first.save(command);
  assert.equal(first.getSnapshot().fresh, false);
  first.dispose();
  const second = await f.open(f.runtime());
  assert.deepEqual(second.getSnapshot().attempt, attempt);
  assert.deepEqual(f.calls(), []);
  await second.save({ ...command, operationId: id(200) });
  assert.deepEqual(f.calls(), []);
  await second.setOnline(false);
  await second.retry();
  assert.deepEqual(f.calls(), []);
  await second.setOnline(true);
  assert.deepEqual(f.calls(), []);
  await second.retry();
  assert.deepEqual(f.calls(), ["save"]);
  assert.deepEqual(second.getSnapshot().result.receipt, receipt);
});
test("a lost cancellation retains cancellation intent and never retries Save after restart", async (t) => {
  const f = await fixture(t);
  await run(f.operations.stage(attempt, () => true));
  const first = await f.open(f.runtime({ send: unavailable }));
  const expected = first.getSnapshot().attempt;
  await first.cancel({ ...expected });
  assert.equal((await run(f.operations.saved())).action, "save");
  await first.cancel(expected);
  assert.equal((await run(f.operations.saved())).action, "cancel");
  first.dispose();
  const second = await f.open(f.runtime());
  assert.deepEqual(f.calls(), []);
  await second.retry();
  assert.deepEqual(f.calls(), ["cancel"]);
  assert.equal(second.getSnapshot().result.status, "cancelled");
  assert.equal(await run(f.operations.saved()), null);
});
test("terminal read recovers a late commit without sending and retains outcome on cleanup failure", async (t) => {
  const f = await fixture(t);
  await run(f.operations.stage(attempt, () => true));
  f.current(result("recorded"));
  const runtime = await f.open(
    f.runtime({ clear: () => Effect.fail(new OfflineFailure({ reason: "storage" })) }),
  );
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.retry();
  assert.deepEqual(f.calls(), []);
  runtime.dispose();
  const reopened = await f.open(f.runtime());
  assert.equal(reopened.getSnapshot().result.status, "recorded");
  assert.equal(await run(f.operations.saved()), null);
  assert.deepEqual(f.calls(), []);
});
test("background interruption hides the draft while durable intent recovers on foreground", async (t) => {
  const f = await fixture(t);
  let entered = false;
  const runtime = await f.open(
    f.runtime({
      send: () =>
        Effect.sync(() => {
          entered = true;
        }).pipe(Effect.andThen(Effect.never)),
    }),
  );
  const saving = runtime.save(command);
  while (!entered) await new Promise((resolve) => setImmediate(resolve));
  await runtime.setActive(false);
  await saving;
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(runtime.getSnapshot().result, null);
  f.current(result("recorded"));
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.deepEqual(f.calls(), []);
});
test("storage failure and account revocation block dispatch and hide financial recovery", async (t) => {
  const f = await fixture(t),
    runtime = await f.open(
      f.runtime({ stage: () => Effect.fail(new OfflineFailure({ reason: "storage" })) }),
    );
  await runtime.save(command);
  assert.deepEqual(f.calls(), []);
  assert.equal(await run(f.operations.saved()), null);
  const other = await f.open(f.runtime());
  await run(f.db.store.activate({ ...account, actor: id(2) }, id(3)));
  await other.save(command);
  assert.equal(other.getSnapshot().verify, true);
  assert.equal(other.getSnapshot().attempt, null);
  assert.deepEqual(f.calls(), []);
});
test("subscription owner recreates recovery after cleanup without stale lifecycle dispatch", async (t) => {
  const { correctionSaveOwner } = await import("../src/money/correction-save-owner.ts");
  const f = await fixture(t),
    owner = correctionSaveOwner(f.operations);
  const release = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await f.open(first);
  release();
  assert.equal(owner.getSnapshot(), null);
  const secondRelease = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(first, second);
  await first.save(command);
  assert.deepEqual(f.calls(), []);
  await f.open(second);
  assert.equal(second.getSnapshot().fresh, true);
  secondRelease();
});
test("returning from receipt navigation retains the known terminal result until explicit acknowledgment", async (t) => {
  const f = await fixture(t),
    runtime = await f.open(f.runtime());
  await runtime.save(command);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().result, null);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  await runtime.save({ ...command, operationId: id(200) });
  assert.deepEqual(f.calls(), ["save"]);
  runtime.acknowledge();
  await runtime.setActive(false);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().result, null);
});

test("connection loss interrupts pending work and reconnect reconciles without an automatic resend", async (t) => {
  const f = await fixture(t);
  let started, release;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const runtime = f.runtime({
    send: () =>
      Effect.tryPromise({
        try: () =>
          new Promise((resolve) => {
            release = resolve;
            started();
          }),
        catch: () => new PreferenceFailure({ code: "unavailable" }),
      }),
  });
  await f.open(runtime);
  const sending = runtime.save(command);
  await waiting;
  await runtime.setOnline(false);
  f.current(result("recorded"));
  release(result("recorded"));
  await sending;
  assert.equal(runtime.getSnapshot().online, false);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.deepEqual(await run(f.db.store.readCorrectionSave(f.db.session)), attempt);
  await runtime.setOnline(true);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.deepEqual(f.calls(), []);
  runtime.dispose();
});
