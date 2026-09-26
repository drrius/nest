import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./legacy-adoption-fixture.mjs";
function state(f) {
  return f.db.sql(`select jsonb_build_object(
    'sources',(select jsonb_agg(r order by id) from public.recurring_expense_rules r),
    'rules',(select jsonb_agg(r) from public.nest_recurring_rules r),
    'revisions',(select jsonb_agg(r) from public.nest_recurring_revisions r),
    'operations',(select jsonb_agg(o) from private.nest_legacy_adoption_operations o),
    'adoptions',(select jsonb_agg(a) from private.nest_legacy_recurring_adoptions a),
    'events',(select jsonb_agg(e order by id) from public.financial_events e))`);
}
async function stale(f, input) {
  const before = state(f);
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_save_legacy_adoption`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), p_operation: id(851), p_input: input }),
  });
  assert.equal(response.status, 412);
  assert.equal((await response.json()).code, "PT412");
  assert.equal(state(f), before);
}
test("stale legacy source and first cycle reject without adoption or posting; fresh adoption replays", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260926105313_native_legacy_adoption_nonretryable_conflicts.sql",
  ]);
  await stale(f, { ...f.command.input, firstDueOn: "2099-01-01" });
  f.db.sql("update public.recurring_expense_rules set description='Changed after review'");
  await stale(f, f.command.input);
  const context = await run(f.native.legacyAdoptionContext(id(800)));
  const command = { ...f.command, input: { ...f.command.input, reviewToken: context.reviewToken } };
  const receipt = await run(f.native.saveLegacyAdoption(command));
  assert.deepEqual(await run(f.native.saveLegacyAdoption(command)), receipt);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
