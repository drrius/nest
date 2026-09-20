import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { changeChore } from "../../apps/api/src/chores/change.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const command = { operationId: id(100), occurrenceId: id(50), expectedDueDate: "2026-09-20" };
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  occurrenceId: id(50),
  action: "skip",
  previousDueDate: "2026-09-20",
  dueDate: "2026-09-20",
  status: "skipped",
};
const run = (action, input, fetch) =>
  Effect.runPromise(
    changeChore(
      { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
      caller,
      action,
      input,
    ).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );
test("skip and reschedule send exact dates with identity-derived scope", async () => {
  for (const action of ["skip", "reschedule"]) {
    const date = action === "skip" ? null : "2026-09-21";
    const input = date ? { ...command, newDueDate: date } : command;
    const result = {
      ...receipt,
      action,
      dueDate: date ?? command.expectedDueDate,
      status: date ? "open" : "skipped",
    };
    assert.deepEqual(
      await run(action, input, async (url, init) => {
        assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_change_chore");
        assert.deepEqual(JSON.parse(init.body), {
          p_household: id(10),
          p_operation: id(100),
          p_occurrence: id(50),
          p_expected_due_date: command.expectedDueDate,
          p_action: action,
          p_new_due_date: date,
        });
        return Response.json(result);
      }),
      result,
    );
  }
});
test("change receipts reject mismatched identity, action, state and dates", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { occurrenceId: id(51) },
    { action: "reschedule" },
    { status: "open" },
    { previousDueDate: "2026-09-19" },
    { dueDate: "2026-09-21" },
    { hidden: true },
  ])
    await assert.rejects(
      run("skip", command, async () => Response.json({ ...receipt, ...patch })),
      { code: "unavailable" },
    );
});
test("strict action contracts reject extra scope and unchanged or malformed reschedule dates", async () => {
  for (const [action, input] of [
    ["skip", { ...command, householdId: id(20) }],
    ["skip", { ...command, newDueDate: "2026-09-21" }],
    ["reschedule", command],
    ["reschedule", { ...command, newDueDate: command.expectedDueDate }],
    ["reschedule", { ...command, newDueDate: "2026-02-30" }],
  ])
    await assert.rejects(
      run(action, input, () => assert.fail("invalid request dispatched")),
      { code: "invalid_request" },
    );
});
