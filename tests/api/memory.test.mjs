import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { memoryReads } from "../../apps/api/src/memory/read.ts";
import { memoryCommands } from "../../apps/api/src/memory/commands.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "Fixture" },
  token: "fixture",
};
const reads = memoryReads(config, caller),
  commands = memoryCommands(config, caller);
const owner = { actorId: id(1), householdId: id(10) };
const row = { ...owner, id: id(100), revision: "1", content: "Private memory" };
const command = {
  memoryId: id(100),
  operationId: id(101),
  expectedRevision: "0",
  content: row.content,
};
const approval = {
  ...owner,
  id: id(102),
  operationId: command.operationId,
  change: { memoryId: command.memoryId, expectedRevision: "0", content: row.content },
  status: "pending",
  expiresAt: "2026-09-20T06:00:00.123456+00:00",
  command: "memory.save",
  commandVersion: 1,
};
const receipt = {
  ...owner,
  memoryId: command.memoryId,
  operationId: command.operationId,
  revision: "1",
  removed: false,
};
const response = (value, range = "0-0/1") =>
  Response.json(value, { headers: { "content-range": range } });
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("memory list validates complete owner-only active rows, rejecting duplicates, private extras and truncated responses", async () => {
  for (const [rows, range] of [
    [[row], "0-0/2"],
    [[], "*/1"],
    [[row, row], "0-1/2"],
    ...[
      { actorId: id(2) },
      { householdId: id(20) },
      { content: null },
      { revision: "0" },
      { revision: 1 },
      { secret: true },
    ].map((patch) => [[{ ...row, ...patch }], "0-0/1"]),
  ])
    await assert.rejects(
      run(reads.list(), async () => response(rows, range)),
      { code: "unavailable" },
    );
  assert.deepEqual((await run(reads.list(), async () => response([], "*/0"))).memories, []);
  const result = await run(reads.list(), async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("actor_id"), `eq.${id(1)}`);
    assert.equal(query.get("household_id"), `eq.${id(10)}`);
    assert.equal(query.get("content"), "not.is.null");
    return response([row]);
  });
  assert.deepEqual(result.memories, [{ id: row.id, revision: "1", content: row.content }]);
});

test("approval reads verify owner, exact identity, command/version, payload shape and complete result range", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { id: id(103) },
    { command: "expenses.record" },
    { commandVersion: 2 },
    { change: { ...approval.change, extra: true } },
    { expiresAt: "invalid" },
  ])
    await assert.rejects(
      run(reads.approval(id(102)), async () => response([{ ...approval, ...patch }])),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(reads.approval(id(102)), async () => response([approval], "0-0/2")),
    { code: "unavailable" },
  );
  await assert.rejects(
    run(reads.approval(id(102)), async () => response([], "*/0")),
    { code: "forbidden" },
  );
  assert.equal(
    (await run(reads.approval(id(102)), async () => response([approval]))).status,
    "pending",
  );
});

test("proposal cannot mistake a different upstream operation or payload for the requested memory", async () => {
  const fetcher = (row) => async (url) =>
    new URL(url).pathname.endsWith("nest_propose_action") ? response(id(102)) : response([row]);
  for (const patch of [
    { operationId: id(103) },
    { change: { ...approval.change, content: "Other" } },
    { change: { ...approval.change, expectedRevision: "1" } },
    { change: { ...approval.change, memoryId: id(104) } },
  ])
    await assert.rejects(run(commands.propose(command), fetcher({ ...approval, ...patch })), {
      code: "unavailable",
    });
  assert.equal((await run(commands.propose(command), fetcher(approval))).id, id(102));
  await assert.rejects(
    run(commands.propose({ ...command, approved: true }), async () =>
      assert.fail("invalid dispatch"),
    ),
    { code: "invalid_request" },
  );
});

test("confirmation validates decision and full actor-bound receipt; removal cannot accept a saved receipt", async () => {
  const input = { ...command, approvalId: id(102), approved: true };
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(103) },
    { memoryId: id(104) },
    { revision: "2" },
    { removed: true },
  ])
    await assert.rejects(
      run(commands.decide(input), async () =>
        response({ status: "consumed", receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(commands.decide(input), async () => response({ status: "denied" })),
    { code: "unavailable" },
  );
  assert.deepEqual(
    await run(commands.decide(input), async () => response({ status: "consumed", receipt })),
    { status: "consumed", receipt },
  );
  const remove = {
    memoryId: command.memoryId,
    operationId: command.operationId,
    expectedRevision: "1",
  };
  await assert.rejects(
    run(commands.remove(remove), async () => response({ ...receipt, revision: "2" })),
    { code: "unavailable" },
  );
  assert.equal(
    (
      await run(commands.remove(remove), async () =>
        response({ ...receipt, revision: "2", removed: true }),
      )
    ).removed,
    true,
  );
});
