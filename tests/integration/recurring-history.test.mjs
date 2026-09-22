import { nodeServer } from "../../apps/api/node-server.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { recurringReadTools } from "../../apps/api/src/money/recurring-tools.ts";
async function fixture(t) {
  const f = await worker(t, [
    "supabase/migrations/20260922004251_native_recurring_cycle_history.sql",
  ]);
  const input = await f.add(800);
  await run(f.worker.execute({ jobId: id(900), input }));
  return { ...f, input, query: { ruleId: input.ruleId, before: null } };
}
test("native and actual AI SDK history reads share authorized retained cycle facts", async (t) => {
  const f = await fixture(t),
    page = await run(f.client().recurringHistory(f.query));
  assert.equal(page.cycles.length, 1);
  assert.equal(page.cycles[0].source, "automatic");
  assert.deepEqual(await run(f.client(f.url, 2, f.partnerBearer).recurringHistory(f.query)), page);
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).recurringHistory(f.query)));
  const config = { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" };
  const tool = (token) =>
    recurringReadTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${token}` } }),
      config,
    ).readRecurringHistory;
  const result = await tool(f.bearer).execute(f.query, { toolCallId: "history", messages: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, page);
  assert.equal(
    (await tool(f.otherBearer).execute(f.query, { toolCallId: "foreign", messages: [] })).ok,
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
test("history transport rejects duplicate/extra parameters and malformed dates", async (t) => {
  const f = await fixture(t);
  for (const query of [
    `ruleId=${id(800)}&ruleId=${id(801)}`,
    `ruleId=${id(800)}&before=2026-01-01&before=2026-02-01`,
    `ruleId=${id(800)}&actorId=${id(2)}`,
    `ruleId=${id(800)}&before=not-a-date`,
  ]) {
    const response = await fetch(`${f.url}/v1/money/recurring/cycles?${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
  const empty = await run(f.client().recurringHistory({ ...f.query, before: f.input.dueOn }));
  assert.deepEqual(empty.cycles, []);
  assert.equal(empty.next, null);
});

test("native client rejects substituted household, rule, cursor and private extra fields", async (t) => {
  const f = await fixture(t),
    page = await run(f.client().recurringHistory(f.query));
  let body = page;
  const server = nodeServer(() => Promise.resolve(Response.json(body)));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const client = f.client(`http://127.0.0.1:${server.address().port}`);
  for (const value of [
    { ...page, householdId: id(20) },
    { ...page, ruleId: id(999) },
    { ...page, before: "9999-01-01" },
    { ...page, cycles: [{ ...page.cycles[0], approvalId: id(900) }] },
    { ...page, cycles: [{ ...page.cycles[0], amountCentimes: "999" }] },
  ]) {
    body = value;
    await assert.rejects(run(client.recurringHistory(f.query)));
  }
});
