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
  sourceWeekStart: "2030-01-07",
  targetWeekStart: "2030-01-14",
  date: "2030-01-15",
  slot: "dinner",
  entryId: "ABCDEF00-0000-4000-8000-000000000200",
  expectedSourceRevision: "9007199254740993",
  expectedTargetRevision: "9007199254740993",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  sourceEntryId: command.entryId.toLowerCase(),
  entryId: id(300),
  sourceWeekStart: command.sourceWeekStart,
  targetWeekStart: command.targetWeekStart,
  date: command.date,
  slot: command.slot,
  sourceRevision: "9007199254740993",
  targetRevision: "9007199254740994",
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

test("AI leftovers bind both week baselines, source and destination identities exactly", async () => {
  for (const same of [false, true]) {
    const value = same
      ? { ...command, targetWeekStart: command.sourceWeekStart, date: "2030-01-08" }
      : command;
    const saved = same
      ? {
          ...receipt,
          targetWeekStart: value.targetWeekStart,
          date: value.date,
          sourceRevision: "9007199254740994",
        }
      : receipt;
    const calls = [];
    assert.deepEqual(await run("placeLeftovers", value, fetcher(saved, calls)), saved);
    assert.deepEqual(calls[0].p_input, value);
    assert.equal(calls[0].p_tool, "placeLeftovers");
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(20) },
      { sourceEntryId: id(99) },
      { entryId: saved.sourceEntryId },
      { sourceRevision: "9007199254740995" },
      { targetRevision: "9007199254740993" },
      { date: "2030-01-16" },
      { sourceWeekStart: "2030-01-14" },
      { targetWeekStart: "2030-01-21" },
      { slot: "lunch" },
      { hidden: true },
    ])
      await assert.rejects(run("placeLeftovers", value, fetcher({ ...saved, ...patch })), {
        code: "unavailable",
      });
    for (const patch of [
      { actorId: id(2) },
      { operationId: id(9) },
      { title: "Injected" },
      { expectedSourceRevision: "-1" },
    ])
      await assert.rejects(run("placeLeftovers", { ...value, ...patch }, fetcher(saved, calls)), {
        code: "unavailable",
      });
    assert.equal(calls.length, 1);
  }
});
