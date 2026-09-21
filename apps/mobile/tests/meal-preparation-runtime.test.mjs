import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealPreparationRuntime } from "../src/meals/preparation-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { weekStart: "2030-01-07", entryId: id(30) };
const draft = {
  title: "Soak beans",
  instructions: null,
  dueOn: "2030-01-06",
  assignment: { policy: "shared" },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  ...target,
  revision: "9007199254740993",
  routineId: id(40),
  occurrenceId: id(41),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  dueOn: draft.dueOn,
};
const initial = {
  version: 1,
  householdId: id(10),
  ...target,
  revision: receipt.revision,
  entry: { entryId: id(30), title: "Beans", date: "2030-01-07" },
  preparation: null,
};
const saved = {
  ...initial,
  preparation: {
    ...draft,
    routineId: id(40),
    occurrenceId: id(41),
    routineVersion: receipt.routineVersion,
    status: "open",
    state: "active",
    plannedAssigneeId: null,
  },
};
const fail = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
function harness() {
  let detail = Effect.succeed(initial),
    response = fail(),
    reads = 0;
  const calls = [];
  const client = {
    meals: {
      read: () => Effect.succeed({ weekStart: target.weekStart, revision: receipt.revision }),
      readPreparation: (query) => {
        reads++;
        assert.deepEqual(query, { ...target, revision: receipt.revision });
        return detail;
      },
      createPreparation: (input) => {
        calls.push(input);
        return response;
      },
    },
    routines: {
      read: () =>
        Effect.succeed({
          members: [
            { actorId: id(1), displayName: "A" },
            { actorId: id(2), displayName: "B" },
          ],
        }),
    },
  };
  const runtime = new MealPreparationRuntime(client, target, () => id(20));
  return {
    runtime,
    calls,
    reads: () => reads,
    detail: (next) => {
      detail = next;
    },
    response: (next) => {
      response = next;
    },
  };
}
test("uncertain preparation deep-copies exact fields and baselines until retry", async () => {
  const f = harness(),
    draftInput = { ...draft, assignment: { policy: "assigned", memberId: id(2) } };
  await f.runtime.load();
  await f.runtime.save(draftInput);
  assert.equal(f.runtime.getSnapshot().stage, "uncertain");
  assert.equal(f.runtime.getSnapshot().pendingWrite, true);
  draftInput.title = "Changed";
  draftInput.assignment.memberId = id(1);
  await f.runtime.load();
  await f.runtime.save(draft);
  assert.equal(f.reads(), 1);
  assert.equal(f.calls.length, 1);
  f.detail(Effect.succeed(saved));
  f.response(Effect.succeed(receipt));
  await f.runtime.retry();
  assert.deepEqual(f.calls[1], f.calls[0]);
  assert.equal(f.calls[1].preparation.title, draft.title);
  assert.equal(f.calls[1].preparation.assignment.memberId, id(2));
  assert.equal(f.calls[1].expectedRevision, receipt.revision);
  assert.equal(f.runtime.getSnapshot().stage, "saved");
  f.runtime.dispose();
});
test("confirmed preparation survives hidden receipts during failed account refresh and never resends", async () => {
  const f = harness();
  await f.runtime.load();
  f.response(Effect.succeed(receipt));
  f.detail(fail("forbidden"));
  await f.runtime.save(draft);
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  assert.equal(f.runtime.getSnapshot().snapshot, null);
  assert.equal(f.runtime.getSnapshot().receipt, null);
  f.detail(fail());
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  f.detail(Effect.succeed(initial));
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  f.detail(Effect.succeed(saved));
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().stage, "saved");
  await f.runtime.save(draft);
  await f.runtime.retry();
  assert.equal(f.calls.length, 1);
  f.runtime.dispose();
});
test("existing tasks, missing meals and injected or foreign assignment cannot create", async () => {
  const f = harness();
  for (const detail of [saved, { ...initial, entry: null }]) {
    f.detail(Effect.succeed(detail));
    await f.runtime.load();
    await f.runtime.save(draft);
  }
  f.detail(Effect.succeed(initial));
  await f.runtime.load();
  await f.runtime.save({ ...draft, actorId: id(2) });
  await f.runtime.save({ ...draft, assignment: { policy: "assigned", memberId: id(3) } });
  assert.equal(f.calls.length, 0);
  f.response(fail("conflict"));
  await f.runtime.save(draft);
  assert.equal(f.runtime.getSnapshot().stage, "reload");
  await f.runtime.save(draft);
  await f.runtime.retry();
  assert.equal(f.calls.length, 1);
  f.runtime.dispose();
});
test("confirmed reads reject older routine versions and disposal prevents late publication", async () => {
  const f = harness();
  await f.runtime.load();
  f.response(Effect.succeed(receipt));
  f.detail(
    Effect.succeed({
      ...saved,
      preparation: { ...saved.preparation, routineVersion: "2030-01-07T12:00:00.123455Z" },
    }),
  );
  await f.runtime.save(draft);
  assert.equal(f.runtime.getSnapshot().stage, "reload");
  const pending = f.runtime.load(),
    view = f.runtime.getSnapshot();
  f.runtime.dispose();
  await pending;
  assert.equal(f.runtime.getSnapshot(), view);
  assert.equal(f.calls.length, 1);
});
