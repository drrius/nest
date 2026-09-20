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
const command = { occurrenceId: id(103), expectedDueDate: "2026-09-20" };
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  occurrenceId: id(103),
  previousDueDate: "2026-09-20",
  dueDate: "2026-09-20",
  action: "skip",
  status: "skipped",
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
test("AI chore adapter binds action, target, both dates and member scope for both receipt variants", async () => {
  for (const tool of ["skipChore", "rescheduleChore"]) {
    const input = tool === "skipChore" ? command : { ...command, newDueDate: "2026-09-22" };
    const saved =
      tool === "skipChore"
        ? receipt
        : { ...receipt, action: "reschedule", status: "open", dueDate: input.newDueDate };
    const calls = [];
    assert.deepEqual(await run(tool, input, fetcher(saved, calls)), saved);
    assert.deepEqual(calls[0], {
      p_household: id(10),
      p_conversation: turn.conversationId,
      p_turn: turn.operationId,
      p_call: "change",
      p_tool: tool,
      p_input: input,
    });
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(11) },
      { occurrenceId: id(999) },
      { previousDueDate: "2026-09-19" },
      { dueDate: "2026-09-23" },
      { action: "complete" },
      { status: "completed" },
    ])
      await assert.rejects(run(tool, input, fetcher({ ...saved, ...patch })), {
        code: "unavailable",
      });
  }
});
test("AI chore adapter cannot inject scope or retry identity, follow another household, or reschedule to the same date", async () => {
  const calls = [];
  for (const patch of [{ actorId: id(2) }, { operationId: id(50) }, { householdId: id(11) }])
    await assert.rejects(run("skipChore", { ...command, ...patch }, fetcher(receipt, calls)), {
      code: "unavailable",
    });
  await assert.rejects(
    run(
      "rescheduleChore",
      { ...command, newDueDate: command.expectedDueDate },
      fetcher(receipt, calls),
    ),
    { code: "unavailable" },
  );
  await assert.rejects(run("skipChore", command, fetcher(receipt, calls, id(11))), {
    code: "forbidden",
  });
  assert.equal(calls.length, 0);
});
