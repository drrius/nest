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
const command = { occurrenceId: id(103), expectedDueDate: "2026-09-20", recipientId: id(2) };
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  requestId: id(104),
  occurrenceId: id(103),
  dueDate: "2026-09-20",
  fromMemberId: id(1),
  toMemberId: id(2),
  action: "request",
  state: "pending",
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
test("AI handover adapter binds request target/date/recipient and response request/action to the current member", async () => {
  for (const [tool, input, value] of [
    ["requestChoreTransfer", command, receipt],
    [
      "respondChoreTransfer",
      { requestId: id(104), action: "accept" },
      { ...receipt, fromMemberId: id(2), toMemberId: id(1), action: "accept", state: "accepted" },
    ],
  ]) {
    const calls = [];
    assert.deepEqual(await run(tool, input, fetcher(value, calls)), value);
    assert.deepEqual(calls[0], {
      p_household: id(10),
      p_conversation: turn.conversationId,
      p_turn: turn.operationId,
      p_call: "change",
      p_tool: tool,
      p_input: input,
    });
    const mismatches =
      tool === "requestChoreTransfer"
        ? [
            { occurrenceId: id(999) },
            { dueDate: "2026-09-21" },
            { toMemberId: id(999) },
            { action: "decline", state: "declined" },
          ]
        : [{ requestId: id(999) }, { action: "decline", state: "declined" }];
    for (const patch of [
      ...mismatches,
      { actorId: id(2) },
      { householdId: id(11) },
      { hidden: true },
    ])
      await assert.rejects(run(tool, input, fetcher({ ...value, ...patch })), {
        code: "unavailable",
      });
    for (const patch of [{ actorId: id(2) }, { householdId: id(11) }, { operationId: id(8) }])
      await assert.rejects(run(tool, { ...input, ...patch }, fetcher(value, calls)), {
        code: "unavailable",
      });
    assert.equal(calls.length, 1);
  }
});
