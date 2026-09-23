import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedRecurringRehearsal(db) {
  const shares = JSON.stringify([
    { memberId: id(1), allocatedCents: 51 },
    { memberId: id(2), allocatedCents: 50 },
  ]);
  db.sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,day_of_month,active,next_occurrence_on)
    values('${id(900)}','${id(10)}','Synthetic active legacy rule',101,'${id(1)}','${shares}','monthly',31,true,'2026-01-31'),
      ('${id(901)}','${id(10)}','Synthetic inactive legacy rule',101,'${id(1)}','${shares}','monthly',31,false,'2026-01-31');
    insert into public.expense_drafts(id,household_id,source_kind,description,amount_cents,payer_member_id,proposed_allocations,occurred_on,status,recurring_expense_rule_id)
    values('${id(910)}','${id(10)}','recurring','Synthetic pending draft',101,'${id(1)}','${shares}','2026-01-31','pending','${id(900)}'),
      ('${id(911)}','${id(10)}','recurring','Synthetic dismissed draft',101,'${id(1)}','${shares}','2025-12-31','dismissed','${id(900)}'),
      ('${id(912)}','${id(10)}','recurring','Synthetic posted draft',101,'${id(1)}','${shares}','2025-11-30','pending','${id(900)}');
    set role authenticated; set request.jwt.claim.sub='${id(1)}';
    select public.confirm_expense_draft('${id(912)}','fixture-legacy-post');`);
}
export function captureRecurringHistory(db) {
  return db.sql(`select jsonb_build_object(
    'rules',(select jsonb_agg(to_jsonb(r) order by id) from public.recurring_expense_rules r),
    'drafts',(select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d)
  )`);
}
export function verifyRecurringRehearsal(db, before) {
  assert.equal(captureRecurringHistory(db), before, "Retained legacy rules/drafts changed");
  for (const table of [
    "public.nest_recurring_rules",
    "public.nest_recurring_cycles",
    "private.nest_legacy_recurring_adoptions",
  ])
    assert.equal(
      db.sql(`select count(*) from ${table}`),
      "0",
      "Migration granted recurring authority",
    );
  const result = JSON.parse(
    db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}';
    select public.nest_read_legacy_recurring('${id(10)}',null)`),
  );
  assert.deepEqual(
    result.rules.map((rule) => rule.ruleId),
    [id(900), id(901)],
  );
  assert.equal(
    db.sql(`select count(*) from public.financial_events e join public.expense_drafts d
    on d.household_id=e.household_id and d.id=e.expense_draft_id
    where d.id='${id(912)}' and d.status='posted' and e.type='expense' and e.amount_cents=101`),
    "1",
  );
  verifyPostedDraftRead(db);
  return {
    passed: true,
    retainedRules: 2,
    retainedDrafts: 3,
    postedDrafts: 1,
    nativeMandates: 0,
    nativeCycles: 0,
    adoptions: 0,
  };
}

function verifyPostedDraftRead(db) {
  const result = JSON.parse(
    db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}';
    select public.nest_read_legacy_drafts('${id(10)}','${id(900)}',null)`),
  );
  const posted = result.drafts.find((draft) => draft.draftId === id(912));
  assert.equal(posted?.status, "posted");
  assert.equal(
    posted.eventId,
    db.sql(`select id from public.financial_events where expense_draft_id='${id(912)}'`),
  );
}
