import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./legacy-dismissal-fixture.mjs";
function state(f) {
  return f.db.sql(`select jsonb_build_object(
    'drafts',(select jsonb_agg(d order by id) from public.expense_drafts d),
    'operations',(select jsonb_agg(o order by operation_id) from private.nest_legacy_draft_operations o),
    'events',(select jsonb_agg(e order by id) from public.financial_events e))`);
}
test("changed legacy dismissal returns terminal conflict without dismissing or posting, then fresh review replays", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260926104914_native_legacy_dismissal_nonretryable_conflict.sql",
  ]);
  f.db.sql("update public.expense_drafts set description='Changed after review'");
  const before = state(f);
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_save_legacy_dismissal`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_operation: f.command.operationId,
      p_input: f.command.input,
    }),
  });
  assert.equal(response.status, 412);
  assert.equal((await response.json()).code, "PT412");
  assert.equal(state(f), before);
  const context = await run(f.native.legacyDraftContext(id(900)));
  const fresh = { ...f.command, input: { ...f.command.input, reviewToken: context.reviewToken } };
  const receipt = await run(f.native.saveLegacyDismissal(fresh));
  assert.deepEqual(await run(f.native.saveLegacyDismissal(fresh)), receipt);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "dismissed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
