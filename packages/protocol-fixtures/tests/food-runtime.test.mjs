import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { FoodFailure } from "../src/food/client.ts";
import { FoodRuntime } from "../src/food/runtime.ts";
import { foodOwner } from "../src/food/owner.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const preferences = { restrictions: ["Peanuts"], dislikes: [], calorieGoal: null, portions: 1 };
const profile = { revision: "1", preferences };
const failure = (code) => Effect.fail(new FoodFailure({ code }));
test("lost acknowledgment keeps immutable command, blocks double taps and new commands, and replays once", async () => {
  const calls = [];
  let release,
    saved = false,
    uuidCalls = 0;
  const api = {
    read: () => Effect.succeed(saved ? profile : null),
    save: (command) => {
      calls.push(command);
      return calls.length === 1
        ? Effect.tryPromise({
            try: () =>
              new Promise((resolve) => {
                release = resolve;
              }),
            catch: () => new FoodFailure({ code: "unavailable" }),
          }).pipe(Effect.flatMap(() => failure("unavailable")))
        : Effect.succeed({ revision: "1" });
    },
  };
  const runtime = new FoodRuntime(api, () => {
    uuidCalls++;
    return id(100);
  });
  await runtime.load();
  const input = { ...preferences, restrictions: [...preferences.restrictions] };
  const first = runtime.save(input);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  input.restrictions[0] = "Changed after send";
  await runtime.save(preferences);
  await runtime.load();
  saved = true;
  release();
  await first;
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await runtime.save(preferences);
  await runtime.load();
  assert.equal(calls.length, 1);
  assert.equal(uuidCalls, 1);
  await runtime.retry();
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[1].preferences.restrictions, ["Peanuts"]);
  assert.equal(runtime.getSnapshot().stage, "form");
  assert.deepEqual(runtime.getSnapshot().profile, profile);
});
test("confirmed save with failed or regressed reload cannot resend or edit until canonical read succeeds", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new FoodRuntime(
    {
      read: () =>
        ++reads === 1
          ? Effect.succeed(null)
          : reads === 2
            ? failure("unavailable")
            : reads === 3
              ? Effect.succeed(null)
              : Effect.succeed({ ...profile, revision: "2" }),
      save: () => {
        writes++;
        return Effect.succeed({ revision: "1" });
      },
    },
    () => id(100),
  );
  await runtime.load();
  await runtime.save(preferences);
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.save(preferences);
  assert.equal(writes, 1);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.load();
  assert.equal(runtime.getSnapshot().profile.revision, "2");
  assert.equal(writes, 1);
});
test("CAS conflict preserves old visible version without allowing another write until explicit reload", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new FoodRuntime(
    {
      read: () => Effect.succeed({ ...profile, revision: String(++reads) }),
      save: () => {
        writes++;
        return failure("conflict");
      },
    },
    () => id(100),
  );
  await runtime.load();
  await runtime.save(preferences);
  assert.equal(runtime.getSnapshot().stage, "conflict");
  assert.equal(runtime.getSnapshot().profile.revision, "1");
  await runtime.save(preferences);
  await runtime.retry();
  assert.equal(writes, 1);
  await runtime.load();
  assert.equal(runtime.getSnapshot().profile.revision, "2");
  assert.equal(runtime.getSnapshot().stage, "form");
});
test("denied access clears private state and needs a fresh authorized read", async () => {
  let denied = false;
  const runtime = new FoodRuntime(
    {
      read: () => (denied ? failure("forbidden") : Effect.succeed(profile)),
      save: () => failure("forbidden"),
    },
    () => id(100),
  );
  await runtime.load();
  denied = true;
  await runtime.save(preferences);
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().profile, null);
  assert.equal(runtime.getSnapshot().loaded, false);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  denied = false;
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().profile, profile);
});
test("disposing during a delayed read cannot restore private state and Strict Mode obtains a fresh owner", async () => {
  let release;
  const api = {
    read: () =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    save: () => assert.fail("unexpected save"),
  };
  const owner = foodOwner(api, () => id(100));
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const late = release;
  stop();
  late(profile);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.getSnapshot().profile, null);
  assert.equal(owner.getSnapshot(), null);
  const again = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  again();
});

test("a failed conflict reload cannot reopen editing against the stale version", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new FoodRuntime(
    {
      read: () => (++reads === 1 ? Effect.succeed(profile) : failure("unavailable")),
      save: () => {
        writes++;
        return failure("conflict");
      },
    },
    () => id(100),
  );
  await runtime.load();
  await runtime.save(preferences);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "conflict");
  await runtime.save(preferences);
  assert.equal(writes, 1);
});

test("late save completion after disposal cannot reload or expose the prior account", async () => {
  let release,
    reads = 0;
  const runtime = new FoodRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(profile);
      },
      save: () =>
        Effect.promise(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
    },
    () => id(100),
  );
  await runtime.load();
  const saving = runtime.save(preferences);
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  runtime.dispose();
  release({ revision: "2" });
  await saving;
  assert.equal(reads, 1);
  assert.equal(runtime.getSnapshot().profile, null);
  assert.equal(runtime.getSnapshot().loaded, false);
});
