import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./renewal-fixture.mjs";

test("stale renewal and reminder writes return PT412 without changing saved state", async (t) => {
  const f = await fixture(t);
  await run(f.native.save(f.command));
  const { operationId: _operation, ...input } = f.command;
  const before = await run(f.native.detail(f.command.renewalId));
  for (const entry of [
    { name: "nest_save_renewal", input },
    {
      name: "nest_save_renewal_reminder",
      input: {
        renewalId: f.command.renewalId,
        expectedRenewalRevision: id(999),
        expectedRevision: null,
        settings: {
          anchor: "cancellation",
          delivery: {
            enabled: true,
            recipientIds: [id(1), id(2)],
            localTime: "08:30",
            daysBefore: 7,
          },
        },
      },
    },
  ]) {
    const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/${entry.name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ p_household: id(10), p_operation: id(902), p_input: entry.input }),
    });
    assert.equal(response.status, 412, entry.name);
    assert.equal((await response.json()).code, "PT412");
  }
  assert.deepEqual(await run(f.native.detail(f.command.renewalId)), before);
  assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
