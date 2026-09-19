import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";

const user = "00000000-0000-4000-8000-000000000001";
const home = "00000000-0000-4000-8000-000000000010";
const other = "00000000-0000-4000-8000-000000000099";
const occurrence = "00000000-0000-4000-8000-000000000020";
const operation = "00000000-0000-4000-8000-000000000030";
const command = {
  operationId: operation,
  occurrenceId: occurrence,
  expectedDueDate: "2026-09-19",
  completedOn: "2026-09-19",
};
const receipt = {
  version: 1,
  operationId: operation,
  occurrenceId: occurrence,
  completedBy: user,
  completedOn: "2026-09-19",
  outcome: "completed",
};
const row = {
  id: occurrence,
  household_id: home,
  due_date: "2026-09-19",
  planned_assignee_id: null,
  routines: { title: "Water plants" },
};
const calls = [];
let handler;
let origin;
let rpcMode = "success";
let rows = [row];

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  calls.push({ url: request.url, headers: request.headers, body: body ? JSON.parse(body) : null });
  response.setHeader("content-type", "application/json");
  if (request.url === "/auth/v1/user") return response.end(JSON.stringify({ id: user }));
  if (request.url.startsWith("/rest/v1/household_members")) {
    const members =
      request.headers.authorization === "Bearer outsider"
        ? []
        : [{ user_id: user, household_id: home, display_name: "Member" }];
    return response.end(JSON.stringify(members));
  }
  if (request.url.startsWith("/rest/v1/routine_occurrences"))
    return response.end(JSON.stringify(rows));
  if (rpcMode === "redirect") return response.writeHead(302, { Location: "/sink" }).end();
  if (rpcMode === "malformed")
    return response.end(JSON.stringify({ ...receipt, operationId: other }));
  const failures = {
    revoked: [403, "42501"],
    conflict: [409, "40001"],
    invalid: [400, "22023"],
    expired: [401, "PGRST301"],
    outage: [503, "internal"],
  };
  const failure = failures[rpcMode];
  if (failure)
    return response
      .writeHead(failure[0])
      .end(JSON.stringify({ code: failure[1], message: "private detail" }));
  return response.end(JSON.stringify(receipt));
});
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  handler = createHandler({ url: origin, publishableKey: "sb_publishable_fixture" });
});
after(() => new Promise((resolve) => server.close(resolve)));
function read(token = "member") {
  return handler(
    new Request("http://localhost/v1/chores?householdId=" + other, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}
function complete(body = command, token = "member", extra = {}) {
  return handler(
    new Request("http://localhost/v1/chores/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      ...extra,
    }),
  );
}

test("chore reads bind verified household, use caller credentials and return only current authorized rows", async () => {
  const response = await read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    version: 1,
    chores: [
      { occurrenceId: occurrence, title: "Water plants", dueDate: "2026-09-19", assigneeId: null },
    ],
  });
  const call = calls.at(-1);
  const query = new URL(call.url, origin).searchParams;
  assert.equal(query.get("household_id"), `eq.${home}`);
  assert.equal(query.get("role"), "eq.current");
  assert.equal(query.get("status"), "eq.open");
  assert.equal(call.headers.authorization, "Bearer member");
});
test("malformed, cross-household or truncated chore snapshots fail closed", async () => {
  for (const candidate of [
    [{ ...row, household_id: other }],
    [{ ...row, due_date: "2026-02-30" }],
    Array(201).fill(row),
  ]) {
    rows = candidate;
    assert.equal((await read()).status, 503);
  }
  rows = [row];
});
test("nonmembers cannot reach chore reads or completion RPCs", async () => {
  const count = calls.filter(
    (call) => call.url.includes("routine_occurrences") || call.url.includes("/rpc/"),
  ).length;
  assert.equal((await read("outsider")).status, 403);
  assert.equal((await complete(command, "outsider")).status, 403);
  assert.equal(
    calls.filter((call) => call.url.includes("routine_occurrences") || call.url.includes("/rpc/"))
      .length,
    count,
  );
});
test("completion forwards exact stable operation and expected date without choosing an actor or retrying", async () => {
  const before = calls.length;
  const response = await complete();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 1, receipt });
  assert.equal(calls.length - before, 3);
  assert.deepEqual(calls.at(-1).body, {
    p_occurrence_id: occurrence,
    p_operation_id: operation,
    p_expected_due_date: "2026-09-19",
    p_completed_on: "2026-09-19",
  });
  assert.equal(calls.at(-1).headers.authorization, "Bearer member");
});
test("invalid dates, identifiers, unknown fields and oversized commands never reach mutation RPC", async () => {
  const before = calls.filter((call) => call.url.includes("/rpc/")).length;
  for (const input of [
    { ...command, completedOn: "2026-02-30" },
    { ...command, operationId: "bad" },
    { ...command, actor: other },
    { ...command, extra: "x".repeat(9000) },
  ]) {
    assert.equal((await complete(input)).status, 400);
  }
  assert.equal(calls.filter((call) => call.url.includes("/rpc/")).length, before);
});
test("revocation, version conflicts and upstream failures retain safe distinct recovery codes", async () => {
  for (const [mode, status, code] of [
    ["revoked", 403, "forbidden"],
    ["conflict", 409, "conflict"],
    ["invalid", 400, "invalid_request"],
    ["expired", 401, "unauthenticated"],
    ["outage", 503, "unavailable"],
  ]) {
    rpcMode = mode;
    const response = await complete();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
  rpcMode = "success";
});
test("redirects and mismatched receipts cannot acknowledge another operation", async () => {
  for (const mode of ["redirect", "malformed"]) {
    rpcMode = mode;
    assert.equal((await complete()).status, 503);
  }
  assert.equal(
    calls.some((call) => call.url === "/sink"),
    false,
  );
  rpcMode = "success";
});
