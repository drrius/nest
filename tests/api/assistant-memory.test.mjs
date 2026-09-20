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
  text: "Save preferences",
};
function fetcher(value, household = id(10), calls = []) {
  return async (url, init) => {
    if (new URL(url).pathname === "/auth/v1/user") return Response.json({ id: id(1) });
    if (new URL(url).pathname === "/rest/v1/household_members")
      return Response.json([{ user_id: id(1), household_id: household, display_name: "Fixture" }]);
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, value });
  };
}
const execute = assistantCommands(request, config, turn);
const input = { memoryId: null, expectedRevision: "0", content: "Quiet mornings" };
const envelope = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(103),
    operationId: id(102),
    change: { memoryId: id(104), expectedRevision: "0", content: input.content },
    status: "pending",
    expiresAt: "2026-09-20T12:00:00Z",
  },
};
const run = (tool, input, value) =>
  Effect.runPromise(
    execute(tool, input, "memory-call").pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetcher(value)),
    ),
  );
test("memory proposal adapter binds exact content, revision, existing target and owner before displaying native confirmation", async () => {
  assert.deepEqual(await run("proposeMemory", input, envelope), envelope);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    {
      approval: {
        ...envelope.approval,
        change: { ...envelope.approval.change, content: "Substituted" },
      },
    },
    {
      approval: {
        ...envelope.approval,
        change: { ...envelope.approval.change, expectedRevision: "1" },
      },
    },
  ])
    await assert.rejects(run("proposeMemory", input, { ...envelope, ...patch }), {
      code: "unavailable",
    });
  const edit = { ...input, memoryId: id(104), expectedRevision: "1" };
  const changed = { ...envelope, approval: { ...envelope.approval, change: edit } };
  assert.deepEqual(await run("proposeMemory", edit, changed), changed);
  await assert.rejects(run("proposeMemory", { ...edit, memoryId: id(105) }, changed), {
    code: "unavailable",
  });
});
test("memory removal adapter requires owner, exact target, next revision and confirmed deletion", async () => {
  const input = { memoryId: id(104), expectedRevision: "1" };
  const receipt = {
    actorId: id(1),
    householdId: id(10),
    operationId: id(102),
    memoryId: id(104),
    revision: "2",
    removed: true,
  };
  assert.deepEqual(await run("removeMemory", input, receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    { memoryId: id(105) },
    { revision: "3" },
    { removed: false },
  ])
    await assert.rejects(run("removeMemory", input, { ...receipt, ...patch }), {
      code: "unavailable",
    });
});
