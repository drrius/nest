import test from "node:test";
import assert from "node:assert/strict";
import { fixture as dismissal, id, as, json } from "./legacy-draft-confirmation-fixture.mjs";
function fixture(t) {
  const f = dismissal(t);
  f.db.file("supabase/migrations/20260922030816_native_legacy_confirmation_approval.sql");
  const input = f.input();
  const approvalId = f.db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(700)}','recurring.confirm-legacy-draft',1,${json(input)})`,
    ),
  );
  const decide = (approved, payload = input) =>
    `select public.nest_decide_legacy_confirmation('${id(10)}','${id(700)}',${json(payload)},'${approvalId}',${approved})`;
  return { ...f, input, approvalId, decide };
}
test("withdrawal and concurrent approval serialize to one truthful terminal outcome, fencing future retries", async (t) => {
  const f = fixture(t);
  const results = await Promise.allSettled([
    f.db.concurrent(as(1, f.decide(false))),
    f.db.concurrent(as(1, f.decide(true))),
  ]);
  assert.equal(results[0].status, "fulfilled");
  const result = JSON.parse(results[0].value.stdout).approval;
  const recorded = f.db.sql("select count(*) from private.nest_legacy_confirmation_operations");
  if (result.status === "consumed") {
    assert.equal(recorded, "1");
    assert.equal(results[1].status, "fulfilled");
    assert.deepEqual(JSON.parse(results[1].value.stdout).approval, result);
  } else {
    assert.equal(result.status, "denied");
    assert.equal(recorded, "0");
    assert.equal(results[1].status, "rejected");
    assert.throws(() => f.record(f.decide(true)));
  }
  assert.deepEqual(f.record(f.decide(false)).approval, result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), recorded);
});
test("withdrawal revokes expired and separately approved consent without revealing another member's proposal", (t) => {
  const f = fixture(t);
  f.db.sql(
    as(
      1,
      `select public.nest_decide_action('${f.approvalId}','${id(700)}','recurring.confirm-legacy-draft',1,${json(f.input)},true)`,
    ),
  );
  f.db.sql("update public.nest_action_approvals set expires_at=now()-interval '1 second'");
  for (const actor of [2, 3]) assert.throws(() => f.record(f.decide(false), actor));
  assert.throws(() => f.record(f.decide(false, { ...f.input, reviewToken: "0".repeat(64) })));
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "approved");
  assert.equal(f.record(f.decide(false)).approval.status, "denied");
  assert.throws(() => f.record(f.decide(true)));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  for (const role of ["anon", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.decide(false)}`), /permission denied/);
});
