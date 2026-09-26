import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id } from "./legacy-adoption-fixture.mjs";
const files = [
  "supabase/migrations/20260922202827_native_renewal_storage.sql",
  "tests/integration/renewal-conversion-source.sql",
  "supabase/migrations/20260923074049_native_renewal_conversion_provenance.sql",
  "supabase/migrations/20260923074639_native_linked_renewal_conversion.sql",
  "supabase/migrations/20260926105535_native_renewal_conversion_nonretryable_conflicts.sql",
];
function state(f) {
  return f.db.sql(`select jsonb_build_object(
 'sources',(select jsonb_agg(c order by id) from public.household_commitments c),
 'renewals',(select jsonb_agg(r order by id) from public.nest_renewals r),
 'conversions',(select jsonb_agg(c) from private.nest_renewal_conversions c),
 'operations',(select jsonb_agg(o) from private.nest_renewal_operations o),
 'events',(select jsonb_agg(e) from public.financial_events e))`);
}
async function convert(f, input) {
  const r = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_convert_legacy_renewal`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: r.status, body: await r.json() };
}
async function reject(f, input) {
  const before = state(f);
  const r = await convert(f, input);
  assert.equal(r.status, 412);
  assert.equal(r.body.code, "PT412");
  assert.equal(state(f), before);
}
test("reviewed conversion rejects missing/changed sources and conflicting replay without altering provenance", async (t) => {
  const f = await fixture(t, files);
  const source = readFileSync(
    "supabase/migrations/20260921120810_native_ai_expense_proposal.sql",
    "utf8",
  );
  f.db.sql(source.slice(0, source.indexOf("create function private.nest_canonical_expense")));
  const input = {
    p_household: id(10),
    p_legacy: id(1100),
    p_operation: id(1101),
    p_hash: "a".repeat(64),
  };
  await reject(f, input);
  f.db.sql(
    `insert into public.household_commitments(id,household_id,created_by,title,renewal_on) values('${id(1100)}','${id(10)}','${id(1)}','Synthetic renewal','2028-03-01')`,
  );
  await reject(f, input);
  input.p_hash = f.db.sql(
    `select encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') from public.household_commitments c`,
  );
  const first = await convert(f, input);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(await convert(f, input), first);
  await reject(f, { ...input, p_operation: id(1102) });
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_conversions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
