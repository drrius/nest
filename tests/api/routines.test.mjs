import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { routineCommands } from "../../apps/api/src/routines/service.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture-token",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const service = routineCommands(
  { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller,
);
const row = {
  id: id(100),
  household_id: id(10),
  title: "Clean",
  schedule_rule: { kind: "daily" },
  assignment_policy: "shared",
  assigned_member_id: null,
  rotation_anchor_member_id: null,
  paused_at: null,
  archived_at: null,
  updated_at: "2026-09-20T08:00:00.123456+00:00",
};
const roster = [caller.member, { userId: id(2), householdId: id(10), displayName: "B" }];
const response = (value, range) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", "content-range": range ?? "0-0/1" },
  });
const execute = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const backend =
  (rows = [row], range = "0-0/1") =>
  (url, init) => {
    assert.equal(init.headers.authorization, "Bearer fixture-token");
    assert.equal(new URL(url).searchParams.get("household_id"), `eq.${id(10)}`);
    return Promise.resolve(
      new URL(url).pathname.endsWith("household_members")
        ? response(roster, "0-1/2")
        : response(rows, range),
    );
  };
const definition = {
  title: "Clean",
  schedule: { kind: "daily" },
  assignment: { policy: "shared" },
};
const command = { operationId: id(200), definition };
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(200),
  routineId: id(100),
  version: "2026-09-20T08:00:00.123456Z",
  action: "create",
};

test("routine reads preserve exact microseconds and existing legacy Unicode titles", async () => {
  const result = await execute(service.list(), backend([{ ...row, title: "🧹".repeat(120) }]));
  assert.equal(result.routines[0].version, receipt.version);
  assert.equal(result.routines[0].definition.title, "🧹".repeat(120));
  assert.deepEqual(result.members, [
    { actorId: id(1), displayName: "A" },
    { actorId: id(2), displayName: "B" },
  ]);
  for (const [raw, expected] of [
    ["2026-09-20T08:00:00+00:00", "2026-09-20T08:00:00.000000Z"],
    ["2026-09-20T08:00:00.1+00:00", "2026-09-20T08:00:00.100000Z"],
    ["2026-09-20T08:00:00.123457Z", "2026-09-20T08:00:00.123457Z"],
    ["2026-09-20T10:00:00.000001+02:00", "2026-09-20T08:00:00.000001Z"],
    ["2026-01-01T00:00:00.123456+05:30", "2025-12-31T18:30:00.123456Z"],
    ["2026-12-31T23:59:59.999999-03:30", "2027-01-01T03:29:59.999999Z"],
  ])
    assert.equal(
      (await execute(service.list(), backend([{ ...row, updated_at: raw }]))).routines[0].version,
      expected,
    );
});

test("routine reads reject partial, foreign, duplicate and malformed backend rows", async () => {
  for (const [rows, range] of [
    [[row], "0-0/2"],
    [[], "*/1"],
    [[row, row], "0-1/2"],
    [Array.from({ length: 201 }, (_, i) => ({ ...row, id: id(500 + i) })), "0-200/201"],
    [[{ ...row, household_id: id(20) }], "0-0/1"],
    [[{ ...row, archived_at: row.updated_at }], "0-0/1"],
    [[{ ...row, paused_at: "bad" }], "0-0/1"],
    [[{ ...row, updated_at: "2026-02-30T08:00:00.000001+00:00" }], "0-0/1"],
    [[{ ...row, assigned_member_id: id(1) }], "0-0/1"],
    [[{ ...row, assignment_policy: "assigned", assigned_member_id: id(3) }], "0-0/1"],
  ])
    await assert.rejects(execute(service.list(), backend(rows, range)), { code: "unavailable" });
  assert.deepEqual((await execute(service.list(), backend([], "*/0"))).routines, []);
});

test("creation derives household from identity and binds the exact action receipt", async () => {
  const actual = await execute(service.create(command), (url, init) => {
    assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_create_routine");
    assert.deepEqual(JSON.parse(init.body), {
      p_household: id(10),
      p_operation: id(200),
      p_definition: definition,
    });
    return Promise.resolve(response(receipt));
  });
  assert.deepEqual(actual, receipt);
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(201) },
    { action: "edit" },
    { version: "2026-09-20T08:00:00.123Z" },
  ])
    await assert.rejects(
      execute(service.create(command), () => Promise.resolve(response({ ...receipt, ...change }))),
      { code: "unavailable" },
    );
});

test("invalid create input cannot issue a mutation request", async () => {
  for (const input of [
    { ...command, householdId: id(20) },
    { ...command, actorId: id(2) },
    { ...command, definition: { ...definition, title: "\ud800" } },
    { ...command, definition: { ...definition, schedule: { kind: "weekdays", days: [] } } },
  ]) {
    let called = false;
    await assert.rejects(
      execute(service.create(input), () => {
        called = true;
        return Promise.resolve(response(receipt));
      }),
      { code: "invalid_request" },
    );
    assert.equal(called, false);
  }
});
