import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { recoverCompletion } from "../../apps/api/src/chores/receipt-recovery.ts";
import { recoverCheck } from "../../apps/api/src/groceries/receipt-recovery.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "Member" },
  token: "fixture",
};
const cases = [
  {
    recover: recoverCompletion,
    table: "nest_chore_receipts",
    command: {
      operationId: id(100),
      occurrenceId: id(101),
      expectedDueDate: "2026-09-19",
      completedOn: "2026-09-19",
    },
    request: { occurrenceId: id(101), expectedDueDate: "2026-09-19", completedOn: "2026-09-19" },
    result: {
      version: 1,
      operationId: id(100),
      occurrenceId: id(101),
      completedBy: id(2),
      completedOn: "2026-09-18",
      outcome: "already_completed",
    },
  },
  {
    recover: recoverCheck,
    table: "nest_grocery_check_receipts",
    command: { operationId: id(100), itemId: id(101), expectedVersion: "1", checked: true },
    request: { target: id(101), expected: "1", checked: true },
    result: {
      operation: id(100),
      target: id(101),
      version: "2",
      checked: true,
      outcome: "applied",
    },
  },
];
for (const fixture of cases)
  test(`${fixture.table} recovery binds scope, request and result`, async (t) => {
    const row = {
      actor_id: id(1),
      household_id: id(10),
      operation_id: id(100),
      request: fixture.request,
      result: fixture.result,
    };
    const wire = await serverFixture(t);
    const recover = () => Effect.runPromise(fixture.recover(wire.config, caller, fixture.command));
    wire.set([row]);
    assert.deepEqual(await recover(), fixture.result);
    assert.equal(wire.request().headers.authorization, "Bearer fixture");
    const url = new URL(wire.request().url, wire.config.url);
    assert.equal(url.pathname, `/rest/v1/${fixture.table}`);
    for (const [field, expected] of Object.entries({
      actor_id: id(1),
      household_id: id(10),
      operation_id: id(100),
    }))
      assert.equal(url.searchParams.get(field), `eq.${expected}`);
    assert.equal(url.searchParams.get("limit"), "2");
    const invalid = [
      [],
      [row, row],
      [{ ...row, actor_id: id(2) }],
      [{ ...row, household_id: id(20) }],
      [{ ...row, operation_id: id(200) }],
      [{ ...row, request: { ...row.request, unexpected: true } }],
    ];
    for (const section of ["request", "result"])
      for (const field of Object.keys(row[section])) {
        if (
          section === "result" &&
          ["version", "outcome", "completedBy", "completedOn"].includes(field)
        )
          continue;
        const original = row[section][field];
        const changed =
          typeof original === "boolean"
            ? !original
            : original.startsWith("0000")
              ? id(200)
              : original.startsWith("2026-")
                ? "2026-09-18"
                : "999";
        invalid.push([{ ...row, [section]: { ...row[section], [field]: changed } }]);
      }
    for (const rows of invalid) {
      wire.set(rows);
      await assert.rejects(recover(), { code: "unavailable" });
    }
  });
async function serverFixture(t) {
  let body, request;
  const server = createServer((incoming, response) => {
    request = incoming;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return {
    config: { url: `http://127.0.0.1:${server.address().port}`, publishableKey: "fixture" },
    set: (value) => {
      body = value;
    },
    request: () => request,
  };
}
