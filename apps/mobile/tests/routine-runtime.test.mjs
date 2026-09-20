import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { RoutineRuntime } from "../src/routines/runtime.ts";
import { routineOwner } from "../src/routines/owner.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const snapshot = {
  version: 1,
  householdId: id(1),
  members: [2, 3].map((n) => ({ actorId: id(n), displayName: `Member ${n}` })),
  routines: [],
};
const definition = () => ({
  title: "Water plants",
  assignment: { policy: "shared" },
  schedule: { kind: "weekdays", days: [1, 4] },
});
const failure = (code) => Effect.fail(new PreferenceFailure({ code }));
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("unknown create retains its exact identity and deep snapshot, blocking new writes and reload", async () => {
  const calls = [];
  let release,
    reads = 0,
    ids = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(snapshot);
      },
      create: (command) => {
        calls.push(command);
        return calls.length === 1
          ? Effect.promise(
              () =>
                new Promise((resolve) => {
                  release = resolve;
                }),
            ).pipe(Effect.flatMap(() => failure("unavailable")))
          : Effect.succeed({ routineId: id(4) });
      },
    },
    () => {
      ids++;
      return id(5);
    },
  );
  await runtime.load();
  const draft = definition();
  const saving = runtime.create(draft);
  while (!release) await tick();
  draft.title = "Changed";
  draft.schedule.days[0] = 7;
  await runtime.create(definition());
  release();
  await saving;
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await runtime.create(definition());
  await runtime.load();
  assert.equal(reads, 1);
  assert.equal(ids, 1);
  await runtime.retry();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[1].definition, definition());
  assert.equal(runtime.getSnapshot().created, id(4));
  assert.equal(runtime.getSnapshot().stage, "ready");
});
test("confirmed create with failed refresh only reloads and never resends", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => (++reads === 2 ? failure("unavailable") : Effect.succeed(snapshot)),
      create: () => {
        writes++;
        return Effect.succeed({ routineId: id(4) });
      },
    },
    () => id(5),
  );
  await runtime.load();
  await runtime.create(definition());
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.create(definition());
  assert.equal(writes, 1);
  await runtime.load();
  assert.equal(writes, 1);
  assert.equal(runtime.getSnapshot().created, id(4));
});
test("denial wipes household state and a network failure cannot reopen creation", async () => {
  let readFailure = null,
    writes = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => (readFailure ? failure(readFailure) : Effect.succeed(snapshot)),
      create: () => {
        writes++;
        return failure("forbidden");
      },
    },
    () => id(5),
  );
  await runtime.load();
  await runtime.create(definition());
  assert.equal(runtime.getSnapshot().snapshot, null);
  readFailure = "unavailable";
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  await runtime.create(definition());
  assert.equal(writes, 1);
  readFailure = null;
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "ready");
});
test("invalid server response requires a successful reload before a new create", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => (++reads === 1 ? Effect.succeed(snapshot) : failure("unavailable")),
      create: () => {
        writes++;
        return failure("invalid");
      },
    },
    () => id(5),
  );
  await runtime.load();
  await runtime.create(definition());
  await runtime.load();
  await runtime.create(definition());
  await runtime.retry();
  assert.equal(writes, 1);
  assert.equal(runtime.getSnapshot().stage, "reload");
});
test("disposed pending create cannot restore data or trigger a canonical read", async () => {
  let release,
    reads = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed(snapshot);
      },
      create: () =>
        Effect.promise(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
    },
    () => id(5),
  );
  await runtime.load();
  const saving = runtime.create(definition());
  while (!release) await tick();
  runtime.dispose();
  release({ routineId: id(4) });
  await saving;
  assert.equal(reads, 1);
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().created, null);
});
test("owner releases private data and recreates a runtime after Strict Mode resubscription", async () => {
  let release;
  const owner = routineOwner(
    {
      read: () =>
        Effect.promise(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
      create: () => assert.fail("unexpected create"),
    },
    () => id(5),
  );
  const stop = owner.subscribe(() => {});
  const first = owner.getSnapshot();
  while (!release) await tick();
  const late = release;
  stop();
  late(snapshot);
  await tick();
  assert.equal(owner.getSnapshot(), null);
  assert.equal(first.getSnapshot().snapshot, null);
  const again = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  again();
});
