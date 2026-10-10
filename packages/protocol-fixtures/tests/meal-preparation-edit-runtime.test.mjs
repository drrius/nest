import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealPreparationEditRuntime } from "../src/meals/preparation-edit-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { entryId: id(30), weekStart: "2030-01-07" };
const task = {
  routineId: id(40),
  occurrenceId: id(41),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  title: "Soak",
  instructions: null,
  dueOn: "2030-01-06",
  assignment: { policy: "shared" },
  plannedAssigneeId: null,
  status: "open",
  state: "active",
};
const snapshot = {
  version: 1,
  householdId: id(10),
  ...target,
  revision: "9007199254740993",
  entry: { entryId: id(30), title: "Beans", date: "2030-01-07" },
  preparation: task,
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  ...target,
  revision: snapshot.revision,
  routineId: id(40),
  occurrenceId: id(41),
  routineVersion: "2030-01-07T12:00:00.123457Z",
  previousRoutineVersion: task.routineVersion,
  dueOn: task.dueOn,
};
const fail = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
function harness() {
  let read = Effect.succeed(snapshot),
    response = fail();
  const calls = [];
  const runtime = new MealPreparationEditRuntime(
    {
      meals: {
        read: () => Effect.succeed({ weekStart: target.weekStart, revision: snapshot.revision }),
        readPreparation: () => read,
        editPreparation: (value) => {
          calls.push(value);
          return response;
        },
      },
      routines: {
        roster: () =>
          Effect.succeed({
            members: [
              { actorId: id(1), displayName: "A" },
              { actorId: id(2), displayName: "B" },
            ],
          }),
      },
    },
    target,
    () => id(20),
  );
  return {
    runtime,
    calls,
    read: (value) => {
      read = value;
    },
    response: (value) => {
      response = value;
    },
  };
}
test("uncertain preparation edit deep-copies patch and exact baselines until acknowledged retry", async () => {
  const f = harness(),
    patch = { instructions: null, assignment: { policy: "assigned", memberId: id(2) } };
  await f.runtime.load();
  await f.runtime.save(patch);
  assert.equal(f.runtime.getSnapshot().stage, "uncertain");
  patch.instructions = "Changed";
  patch.assignment.memberId = id(1);
  await f.runtime.load();
  await f.runtime.save({ title: "Other" });
  assert.equal(f.calls.length, 1);
  f.response(Effect.succeed(receipt));
  f.read(
    Effect.succeed({
      ...snapshot,
      preparation: { ...task, routineVersion: receipt.routineVersion, status: "completed" },
    }),
  );
  await f.runtime.retry();
  assert.deepEqual(f.calls[1], f.calls[0]);
  assert.equal(f.calls[1].patch.instructions, null);
  assert.equal(f.calls[1].patch.assignment.memberId, id(2));
  assert.equal(f.calls[1].expectedRoutineVersion, task.routineVersion);
  assert.equal(f.calls[1].expectedRevision, snapshot.revision);
  assert.equal(f.runtime.getSnapshot().stage, "saved");
  await f.runtime.save({ title: "Again" });
  assert.equal(f.calls.length, 2);
  f.runtime.dispose();
});
test("confirmed edits stay latched through account denial and reject stale details on recovery", async () => {
  const f = harness();
  await f.runtime.load();
  f.response(Effect.succeed(receipt));
  f.read(fail("forbidden"));
  await f.runtime.save({ title: "Corrected" });
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  assert.equal(f.runtime.getSnapshot().snapshot, null);
  assert.equal(f.runtime.getSnapshot().receipt, null);
  f.read(Effect.succeed(snapshot));
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  f.read(
    Effect.succeed({
      ...snapshot,
      preparation: { ...task, routineVersion: receipt.routineVersion },
    }),
  );
  await f.runtime.load();
  await f.runtime.save({ title: "Duplicate" });
  assert.equal(f.runtime.getSnapshot().stage, "saved");
  assert.equal(f.calls.length, 1);
  f.runtime.dispose();
});
test("edit conflicts require explicit fresh reload and disposed editors cannot publish", async () => {
  const f = harness();
  await f.runtime.load();
  const first = f.runtime.getSnapshot().generation;
  f.response(fail("conflict"));
  await f.runtime.save({ title: "Corrected" });
  assert.equal(f.runtime.getSnapshot().stage, "reload");
  await f.runtime.retry();
  await f.runtime.save({ title: "Again" });
  assert.equal(f.calls.length, 1);
  f.read(
    Effect.succeed({
      ...snapshot,
      preparation: { ...task, routineVersion: receipt.routineVersion },
    }),
  );
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().generation, first + 1);
  assert.equal(f.runtime.getSnapshot().snapshot.preparation.routineVersion, receipt.routineVersion);
  const pending = f.runtime.load(),
    before = f.runtime.getSnapshot();
  f.runtime.dispose();
  await pending;
  assert.equal(f.runtime.getSnapshot(), before);
});
test("missing or archived preparation, hidden fields and foreign assignments never dispatch", async () => {
  const f = harness();
  for (const value of [
    { ...snapshot, entry: null, preparation: null },
    { ...snapshot, preparation: null },
    { ...snapshot, preparation: { ...task, state: "archived" } },
  ]) {
    f.read(Effect.succeed(value));
    await f.runtime.load();
    await f.runtime.save({ title: "Wrong" });
  }
  f.read(Effect.succeed(snapshot));
  await f.runtime.load();
  await f.runtime.save({ operationId: id(99), title: "Wrong" });
  await f.runtime.save({ assignment: { policy: "assigned", memberId: id(3) } });
  assert.equal(f.calls.length, 0);
  f.runtime.dispose();
});
