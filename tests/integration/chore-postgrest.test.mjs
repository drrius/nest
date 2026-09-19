import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";

test("real PostgREST embedding, RLS and receipt RPC connect to the authorized chore API", async (t) => {
  const fixture = await postgrestFixture(t);
  const handler = createHandler({ url: fixture.url, publishableKey: "sb_publishable_fixture" });
  const read = (bearer = fixture.bearer) =>
    handler(
      new Request("http://localhost/v1/chores", {
        headers: { authorization: `Bearer ${bearer}` },
      }),
    );
  const command = {
    operationId: "30000000-0000-4000-8000-000000000001",
    occurrenceId: "00000000-0000-4000-8000-000000000100",
    expectedDueDate: "2026-09-19",
    completedOn: "2026-09-19",
  };
  const complete = (input = command, bearer = fixture.bearer) =>
    handler(
      new Request("http://localhost/v1/chores/complete", {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  const initial = await read();
  assert.equal(initial.status, 200);
  const snapshot = await initial.json();
  assert.equal(snapshot.chores.length, 12);
  assert.ok(snapshot.chores.every((chore) => chore.title === "Water plants"));
  assert.equal((await complete(command, fixture.otherBearer)).status, 403);
  const first = await complete();
  assert.equal(first.status, 200);
  const receipt = await first.json();
  assert.deepEqual(await (await complete()).json(), receipt);
  assert.equal(fixture.db.sql("select count(*) from private.fixture_closure_calls"), "1");
  assert.equal((await (await read()).json()).chores.length, 11);
  const uppercase = {
    ...command,
    operationId: "3ABC0000-0000-4000-8000-000000000001",
    occurrenceId: "AAbC0000-0000-4000-8000-000000000400",
  };
  const mixed = await complete(uppercase);
  assert.equal(mixed.status, 200);
  const mixedReceipt = await mixed.json();
  assert.equal(mixedReceipt.receipt.operationId, uppercase.operationId.toLowerCase());
  assert.equal(mixedReceipt.receipt.occurrenceId, uppercase.occurrenceId.toLowerCase());
  assert.deepEqual(await (await complete(uppercase)).json(), mixedReceipt);
  assert.equal(fixture.db.sql("select count(*) from private.fixture_closure_calls"), "2");
  assert.equal(
    (
      await complete({
        ...command,
        operationId: "30000000-0000-4000-8000-000000000002",
        occurrenceId: "00000000-0000-4000-8000-000000000101",
        expectedDueDate: "2026-09-18",
      })
    ).status,
    409,
  );
  fixture.db.sql(
    "delete from public.household_members where user_id='00000000-0000-4000-8000-000000000001'",
  );
  assert.equal((await complete()).status, 403);
  assert.equal((await read()).status, 403);
});
