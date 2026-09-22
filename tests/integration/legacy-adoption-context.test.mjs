import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as legacy, id, run } from "./legacy-dismissal-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const fixture = (t) =>
  legacy(t, [
    "supabase/migrations/20260922033013_native_legacy_recurring_fences.sql",
    "supabase/migrations/20260922034111_native_legacy_adoption_context.sql",
  ]);
test("authorized native review transports retained adoption blockers and cannot grant a mandate", async (t) => {
  const f = await fixture(t);
  const review = await run(f.native.legacyAdoptionContext(id(800)));
  assert.deepEqual(review.blockers, ["pending_drafts"]);
  assert.equal(review.coveredThrough, "2026-01-31");
  assert.equal(review.rule.ruleId, id(800));
  assert.equal(review.rule.allocations.kind, "needs_review");
  f.db.sql("update public.expense_drafts set status='dismissed'");
  const resolved = await run(f.native.legacyAdoptionContext(id(800)));
  assert.deepEqual(resolved.blockers, []);
  assert.notEqual(resolved.reviewToken, review.reviewToken);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).legacyAdoptionContext(id(800))));
  await assert.rejects(run(f.native.legacyAdoptionContext(id(999))));
  for (const params of ["", `ruleId=${id(800)}&ruleId=${id(800)}`, `ruleId=${id(800)}&extra=1`]) {
    const response = await fetch(`${f.url}/v1/money/recurring/legacy-adoption/context?${params}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
});
test("native adoption review rejects wrong household, source identity and contradictory blockers", async (t) => {
  const f = await fixture(t);
  const value = await run(f.native.legacyAdoptionContext(id(800)));
  for (const forged of [
    { ...value, householdId: id(20) },
    { ...value, rule: { ...value.rule, ruleId: id(999) } },
    { ...value, blockers: [] },
  ]) {
    const injected = async () =>
      new Response(JSON.stringify(forged), { headers: { "content-type": "application/json" } });
    await assert.rejects(
      run(
        f.native.legacyAdoptionContext(id(800)).pipe(Effect.provideService(Fetch.Fetch, injected)),
      ),
    );
  }
});
