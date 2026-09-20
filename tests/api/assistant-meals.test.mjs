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
  weekStart: "2026-10-05",
  expectedRevision: "9007199254740993",
  date: "2026-10-06",
  slot: "lunch",
  title: "Pasta",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  entryId: id(103),
  weekStart: command.weekStart,
  date: command.date,
  slot: command.slot,
  revision: "9007199254740994",
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
test("AI meal receipt binds actor, household, week, day, slot and exact bigint increment", async () => {
  const calls = [];
  assert.deepEqual(await run("placeMeal", command, fetcher(receipt, calls)), receipt);
  assert.deepEqual(calls[0], {
    p_household: id(10),
    p_conversation: turn.conversationId,
    p_turn: turn.operationId,
    p_call: "change",
    p_tool: "placeMeal",
    p_input: command,
  });
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { weekStart: "2026-10-12" },
    { date: "2026-10-07" },
    { slot: "dinner" },
    { revision: "9007199254740993" },
    { revision: "9007199254740995" },
    { entryId: "bad" },
    { hidden: true },
  ])
    await assert.rejects(run("placeMeal", command, fetcher({ ...receipt, ...patch })), {
      code: "unavailable",
    });
});
test("AI meal model cannot supply retry or account identities or bypass the shared date constraint", async () => {
  const calls = [];
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(8) },
    { householdId: id(20) },
    { date: "2026-10-12" },
    { title: " " },
  ])
    await assert.rejects(run("placeMeal", { ...command, ...patch }, fetcher(receipt, calls)), {
      code: "unavailable",
    });
  assert.equal(calls.length, 0);
});
