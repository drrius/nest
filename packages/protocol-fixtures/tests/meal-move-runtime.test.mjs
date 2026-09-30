import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealMoveRuntime } from "../src/meals/move-runtime.ts";
import { mealMoveOwner } from "../src/meals/move-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { sourceWeekStart: "2026-10-05", entryId: id(30) };
const snapshot = (revision = "0", entries = [{ entryId: id(30), title: "Pasta" }]) => ({
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
  entryId: id(30),
  ...target,
  targetWeekStart: target.sourceWeekStart,
  date: "2026-10-06",
  slot: "dinner",
  sourceRevision: "1",
  targetRevision: "1",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
const uuid = () => id(20);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("uncertain move freezes the exact baseline, entry and operation until retry", async () => {
  const calls = [];
  let current = snapshot(),
    response = failure(),
    reads = 0;
  const runtime = new MealMoveRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(current);
      },
      move: (input) => {
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

test("acknowledged move reloads without resending after refresh failure or an older reply", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new MealMoveRuntime(
    {
      read: () => read,
      move: () => {
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
  const runtime = new MealMoveRuntime(
    {
      read: () => Effect.succeed(current),
      move: () => {
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
  const runtime = new MealMoveRuntime(
    { read: () => read, move: () => failure("forbidden") },
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
  const runtime = new MealMoveRuntime(
    {
      read: () => Effect.succeed(snapshot()),
      move: () => {
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
    move: () => Effect.succeed(receipt),
  };
  const owner = mealMoveOwner(client, target, uuid);
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
  assert.equal(second.getSnapshot().receipt.entryId, id(30));
  secondRelease();
});

test("cross-week selection freezes both exact baselines through uncertain retries", async () => {
  let response = failure(),
    calls = [],
    reads = [];
  let destination = { ...snapshot("7", []), weekStart: "2026-10-12" };
  let source = snapshot("3");
  const runtime = new MealMoveRuntime(
    {
      read: (week) => {
        reads.push(week);
        return Effect.succeed(week === target.sourceWeekStart ? source : destination);
      },
      move: (input) => {
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
  response = Effect.succeed({ ...receipt, ...calls[0], sourceRevision: "4", targetRevision: "8" });
  source = snapshot("4", []);
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
  const runtime = new MealMoveRuntime(
    {
      read: (week) => (week === target.sourceWeekStart ? Effect.succeed(snapshot()) : response),
      move: () => {
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
