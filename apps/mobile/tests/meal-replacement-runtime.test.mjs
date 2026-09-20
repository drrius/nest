import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealReplacementRuntime } from "../src/meals/replacement-runtime.ts";
import { mealReplacementOwner } from "../src/meals/replacement-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { entryId: id(31), weekStart: "2026-10-05", date: "2026-10-06", slot: "lunch" };
const snapshot = (revision = "0", entries = [{ ...target, title: "Original meal" }]) => ({
  version: 1,
  householdId: id(10),
  weekStart: target.weekStart,
  revision,
  entries,
});
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  ...target,
  entryId: id(30),
  previousEntryId: target.entryId,
  skippedPreparationId: null,
  revision: "2",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
const uuid = () => id(20);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("uncertain replacement freezes the exact baseline, title and operation until retry", async () => {
  const calls = [];
  let current = snapshot(),
    response = failure(),
    reads = 0;
  const runtime = new MealReplacementRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(current);
      },
      replace: (input) => {
        calls.push(input);
        return response;
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save("Pasta");
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  current = snapshot("2");
  await runtime.load();
  await runtime.save("Changed draft");
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  response = Effect.succeed(receipt);
  await runtime.retry();
  assert.deepEqual(calls[1], calls[0]);
  assert.deepEqual(calls[0], {
    operationId: id(20),
    ...target,
    expectedRevision: "0",
    title: "Pasta",
  });
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  assert.equal(runtime.getSnapshot().snapshot.revision, "2");
  runtime.dispose();
});

test("acknowledged replacement reloads without resending after refresh failure or an older reply", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new MealReplacementRuntime(
    {
      read: () => read,
      replace: () => {
        writes++;
        read = failure();
        return Effect.succeed(receipt);
      },
    },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save("Pasta");
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.deepEqual(runtime.getSnapshot().receipt, receipt);
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  await runtime.retry();
  await runtime.save("Pasta again");
  assert.equal(writes, 1);
  read = Effect.succeed(snapshot());
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "reload");
  read = Effect.succeed(snapshot("2"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(writes, 1);
  runtime.dispose();
});

test("conflicts require explicit reload; missing or substituted originals and invalid drafts cannot dispatch", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new MealReplacementRuntime(
    {
      read: () => read,
      replace: () => {
        writes++;
        return failure("conflict");
      },
    },
    target,
    uuid,
  );
  await runtime.save("Before load");
  await runtime.load();
  await runtime.save(" ");
  assert.equal(writes, 0);
  await runtime.save("Pasta");
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  await runtime.save("Changed");
  await runtime.retry();
  assert.equal(writes, 1);
  read = Effect.succeed(snapshot("1", [{ ...target, entryId: id(32), title: "Partner meal" }]));
  await runtime.load();
  await runtime.save("Rereplacement");
  assert.match(runtime.getSnapshot().notice, /original meal is no longer/);
  assert.equal(writes, 1);
  runtime.dispose();
});

test("access denial hides data and remains sticky until an authorized read succeeds", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  const runtime = new MealReplacementRuntime(
    { read: () => read, replace: () => failure("forbidden") },
    target,
    uuid,
  );
  await runtime.load();
  await runtime.save("Pasta");
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  read = failure();
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().snapshot, null);
  read = Effect.succeed(snapshot("4"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "ready");
  runtime.dispose();
});

test("duplicate submissions are blocked and disposal prevents late write or read publication", async () => {
  let resolve,
    writes = 0;
  const runtime = new MealReplacementRuntime(
    {
      read: () => Effect.succeed(snapshot()),
      replace: () => {
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
  const pending = runtime.save("Pasta");
  await flush();
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  await runtime.save("Duplicate");
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
    replace: () => Effect.succeed(receipt),
  };
  const owner = mealReplacementOwner(client, target, uuid);
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
  assert.equal(second.getSnapshot().snapshot.revision, "0");
  assert.equal(reads, 2);
  await second.save("Pasta");
  assert.equal(second.getSnapshot().receipt.entryId, id(30));
  secondRelease();
});
