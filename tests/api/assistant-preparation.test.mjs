import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { assistantCommands } from "../../apps/api/src/assistant/commands.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = new Request("http://localhost/", {
  headers: { authorization: "Bearer fixture", "x-nest-household": id(10) },
});
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const turn = {
  conversationId: id(100),
  operationId: id(101),
  expectedRevision: "0",
  text: "Change chore",
};
const execute = assistantCommands(request, config, turn);
const command = {
  entryId: "ABCDEF00-0000-4000-8000-000000000200",
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  preparation: {
    title: "Soak beans",
    instructions: null,
    dueOn: "2030-01-06",
    assignment: { policy: "shared" },
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  entryId: command.entryId.toLowerCase(),
  weekStart: command.weekStart,
  revision: command.expectedRevision,
  routineId: id(300),
  occurrenceId: id(301),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  dueOn: command.preparation.dueOn,
};
function fetcher(value, calls = [], household = id(10)) {
  return async (url, init) => {
    if (new URL(url).pathname === "/auth/v1/user") return Response.json({ id: id(1) });
    if (new URL(url).pathname === "/rest/v1/household_members")
      return Response.json([{ user_id: id(1), household_id: household, display_name: "Fixture" }]);
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, value });
  };
}
const run = (tool, input, fetch) =>
  Effect.runPromise(
    execute(tool, input, "change").pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("AI preparation binds exact source, unchanged week revision, due date and caller", async () => {
  const calls = [];
  assert.deepEqual(await run("createMealPreparation", command, fetcher(receipt, calls)), receipt);
  assert.deepEqual(calls[0].p_input, command);
  assert.equal(calls[0].p_tool, "createMealPreparation");
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { entryId: id(99) },
    { revision: "9007199254740994" },
    { weekStart: "2030-01-14" },
    { dueOn: "2030-01-07" },
    { hidden: true },
  ])
    await assert.rejects(run("createMealPreparation", command, fetcher({ ...receipt, ...patch })), {
      code: "unavailable",
    });
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(9) },
    { expectedRevision: "-1" },
    { preparation: { ...command.preparation, householdId: id(20) } },
  ])
    await assert.rejects(
      run("createMealPreparation", { ...command, ...patch }, fetcher(receipt, calls)),
      { code: "unavailable" },
    );
  assert.equal(calls.length, 1);
});
