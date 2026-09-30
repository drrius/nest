import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealLeftoversRuntime } from "../src/meals/leftovers-runtime.ts";
import { mealLeftoversOwner } from "../src/meals/leftovers-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { sourceWeekStart: "2026-10-05", entryId: id(30) };
const snapshot = (
  revision = "0",
  entries = [
    { entryId: id(30), title: "Pasta", date: "2026-10-05", slot: "dinner", leftoverSourceId: null },
  ],
) => ({
  version: 1,
  householdId: id(10),
  weekStart: target.sourceWeekStart,
  revision,
  entries,
});
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  ...target,
  entryId: id(40),
  sourceEntryId: target.entryId,
  targetWeekStart: target.sourceWeekStart,
  date: "2026-10-06",
  slot: "dinner",
  sourceRevision: "1",
  targetRevision: "1",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
const uuid = () => id(20);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("uncertain leftovers freezes the exact baseline, entry and operation until retry", async () => {
  const calls = [];
  let current = snapshot(),
    response = failure(),
    reads = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(current);
      },
      placeLeftovers: (input) => {
        calls.push(input);
        return response;
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  current = snapshot("2");
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  response = Effect.succeed(receipt);
  await runtime.retry();
  assert.deepEqual(calls[1], calls[0]);
  assert.deepEqual(calls[0], {
    operationId: id(20),
    ...target,
    expectedSourceRevision: "0",
    expectedTargetRevision: "0",
    targetWeekStart: target.sourceWeekStart,
    date: "2026-10-06",
    slot: "dinner",
  });
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  assert.equal(runtime.getSnapshot().source.revision, "2");
  runtime.dispose();
});

test("acknowledged leftovers reloads without resending after refresh failure or an older reply", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: () => read,
      placeLeftovers: () => {
        writes++;
        read = failure();
        return Effect.succeed(receipt);
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.deepEqual(runtime.getSnapshot().receipt, receipt);
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  await runtime.retry();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(writes, 1);
  read = Effect.succeed(snapshot());
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "reload");
  read = Effect.succeed(snapshot("1"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(writes, 1);
  runtime.dispose();
});

test("missing meals and conflicts cannot silently dispatch again", async () => {
  let current = snapshot("0", []),
    writes = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: () => Effect.succeed(current),
      placeLeftovers: () => {
        writes++;
        return failure("conflict");
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(writes, 0);
  current = snapshot();
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  await runtime.retry();
  assert.equal(writes, 1);
  runtime.dispose();
});

test("access denial hides data and remains sticky until an authorized read succeeds", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  const runtime = new MealLeftoversRuntime(
    { read: () => read, placeLeftovers: () => failure("forbidden") },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().source, null);
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  read = failure();
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().source, null);
  read = Effect.succeed(snapshot("4"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "ready");
  runtime.dispose();
});

test("duplicate submissions are blocked and disposal prevents late write or read publication", async () => {
  let resolve,
    writes = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: () => Effect.succeed(snapshot()),
      placeLeftovers: () => {
        writes++;
        return Effect.promise(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        );
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  const pending = runtime.save({ date: "2026-10-06", slot: "dinner" });
  await flush();
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(writes, 1);
  const before = runtime.getSnapshot();
  runtime.dispose();
  resolve(receipt);
  await pending;
  assert.equal(runtime.getSnapshot(), before);
});

test("Strict Mode owner release recreates a usable runtime and initial reads are not pending writes", async () => {
  let reads = 0;
  const client = {
    read: () => {
      reads++;
      return Effect.succeed(snapshot());
    },
    placeLeftovers: () => Effect.succeed(receipt),
  };
  const owner = mealLeftoversOwner(client, target, uuid);
  assert.equal(owner.getSnapshot(), null);
  const release = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  assert.equal(first.getSnapshot().pendingWrite, false);
  release();
  assert.equal(owner.getSnapshot(), null);
  const secondRelease = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(first, second);
  await flush();
  assert.equal(second.getSnapshot().source.revision, "0");
  assert.equal(reads, 2);
  await second.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(second.getSnapshot().receipt.entryId, id(40));
  secondRelease();
});

test("cross-week selection freezes both exact baselines through uncertain retries", async () => {
  let response = failure(),
    calls = [],
    reads = [];
  let destination = { ...snapshot("7", []), weekStart: "2026-10-12" };
  let source = snapshot("3");
  const runtime = new MealLeftoversRuntime(
    {
      read: (week) => {
        reads.push(week);
        return Effect.succeed(week === target.sourceWeekStart ? source : destination);
      },
      placeLeftovers: (input) => {
        calls.push(input);
        return response;
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  assert.deepEqual(reads, [target.sourceWeekStart]);
  await runtime.selectWeek(destination.weekStart);
  await runtime.save({ date: "2026-10-13", slot: "lunch" });
  assert.equal(calls[0].expectedSourceRevision, "3");
  assert.equal(calls[0].expectedTargetRevision, "7");
  await runtime.selectWeek("2026-10-19");
  await runtime.load();
  assert.equal(runtime.getSnapshot().targetWeekStart, "2026-10-12");
  assert.equal(reads.length, 3);
  response = Effect.succeed({ ...receipt, ...calls[0], sourceRevision: "3", targetRevision: "8" });
  source = snapshot("3");
  destination = { ...destination, revision: "9" };
  await runtime.retry();
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().destination.revision, "9");
  runtime.dispose();
});

test("occupied or invalid destinations do not write and partial week reads cannot enable save", async () => {
  /** @type {Effect.Effect<any, PreferenceFailure>} */
  let response = Effect.succeed({
    ...snapshot("2"),
    entries: [{ entryId: id(40), date: "2026-10-13", slot: "dinner" }],
    weekStart: "2026-10-12",
  });
  let writes = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: (week) => (week === target.sourceWeekStart ? Effect.succeed(snapshot()) : response),
      placeLeftovers: () => {
        writes++;
        return failure();
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.selectWeek("2026-10-12");
  await runtime.save({ date: "2026-10-13", slot: "dinner" });
  await runtime.save({ date: "2026-10-20", slot: "lunch" });
  assert.equal(writes, 0);
  response = failure();
  await runtime.selectWeek("2026-10-19");
  assert.equal(runtime.getSnapshot().destination, null);
  await runtime.save({ date: "2026-10-20", slot: "lunch" });
  assert.equal(writes, 0);
  runtime.dispose();
});

test("confirmed leftovers stay latched through authorization loss and recovery", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let response = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new MealLeftoversRuntime(
    {
      read: () => response,
      placeLeftovers: () => {
        writes++;
        response = failure("forbidden");
        return Effect.succeed(receipt);
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "dinner" });
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().receipt, null);
  response = failure();
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  response = Effect.succeed(snapshot("1"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.deepEqual(runtime.getSnapshot().receipt, receipt);
  await runtime.save({ date: "2026-10-07", slot: "lunch" });
  await runtime.retry();
  assert.equal(writes, 1);
  runtime.dispose();
});
test("same-day leftovers, chains and injected destination identities cannot dispatch", async () => {
  let current = snapshot();
  const runtime = new MealLeftoversRuntime(
    {
      read: () => Effect.succeed(current),
      placeLeftovers: () => assert.fail("dispatched"),
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save({ date: "2026-10-05", slot: "lunch" });
  await runtime.save({ date: "2026-10-06", slot: "lunch", entryId: id(99) });
  current = snapshot("1", [{ ...current.entries[0], leftoverSourceId: id(99) }]);
  await runtime.load();
  await runtime.save({ date: "2026-10-06", slot: "lunch" });
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  runtime.dispose();
});
