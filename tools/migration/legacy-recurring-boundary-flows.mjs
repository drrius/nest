import assert from "node:assert/strict";
import { runRecurringBoundary as run } from "./legacy-recurring-boundary-runner.mjs";
import {
  recurringBoundaryId as id,
  recurringCreate,
  recurringUpdate,
  recurringActive,
  recurringGenerate,
  recurringConfirm,
  recurringDismiss,
} from "./legacy-recurring-boundary-calls.mjs";

function flow(db, actor, { expression, observation, setup = "" }) {
  const output = run(
    db,
    actor,
    `select ${expression}; select ${expression}; reset role;
    select ${observation}`,
    { setup },
  )
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(output.length, 3);
  assert.deepEqual(output[0], output[1], "Identical command replay changed its receipt");
  return output[2];
}

const financialCounts = `jsonb_build_object(
  'events',(select count(*) from public.financial_events),
  'nativeRules',(select count(*) from public.nest_recurring_rules),
  'nativeCycles',(select count(*) from public.nest_recurring_cycles),
  'adoptions',(select count(*) from private.nest_legacy_recurring_adoptions))`;

function draftOnly(value, baseline) {
  assert.deepEqual(value.authority, baseline);
}

export function recurringFlows(db, cases) {
  const baseline = JSON.parse(db.sql(`select ${financialCounts}`));
  for (const actor of [1, 2]) {
    createFlow(db, cases, actor, baseline);
    updateFlow(db, cases, actor, baseline);
    pauseFlow(db, cases, actor, baseline);
    generateFlow(db, cases, actor, baseline);
    confirmFlow(db, cases, actor, baseline);
    dismissFlow(db, cases, actor, baseline);
  }
}

function createFlow(db, cases, actor, baseline) {
  const value = flow(db, actor, {
    expression: recurringCreate(),
    observation: `jsonb_build_object(
    'authority',${financialCounts},'rules',(select count(*) from public.recurring_expense_rules),
    'receipts',(select count(*) from public.money_command_receipts where idempotency_key='boundary-create'),
    'terms',(select jsonb_build_object('amount',amount_cents,'active',active,'next',next_occurrence_on)
      from public.recurring_expense_rules where description='Boundary recurring'))`,
  });
  draftOnly(value, baseline);
  assert.equal(value.rules, 3);
  assert.equal(value.receipts, 1);
  assert.deepEqual(value.terms, { amount: 101, active: true, next: "2026-01-31" });
  cases.push({
    function: "create_recurring_expense_rule",
    actor,
    reason: "exact-replay-one-draft-only-rule",
    ...value,
  });
}

function updateFlow(db, cases, actor, baseline) {
  const before = db.sql(`select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d`);
  const value = flow(db, actor, {
    expression: recurringUpdate({ description: "Changed recurring" }),
    observation: `jsonb_build_object('authority',${financialCounts},
      'description',(select description from public.recurring_expense_rules where id='${id(900)}'),
      'versionAdvanced',(select r.updated_at>v.updated_at from public.recurring_expense_rules r
        cross join pg_temp.recurring_boundary_version v where r.id='${id(900)}'),
      'retainedDrafts',(select count(*) from public.expense_drafts where recurring_expense_rule_id='${id(900)}'),
      'draftTerms',(select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d))`,
  });
  draftOnly(value, baseline);
  assert.equal(value.description, "Changed recurring");
  assert.equal(value.versionAdvanced, true);
  assert.equal(value.retainedDrafts, 3);
  assert.deepEqual(value.draftTerms, JSON.parse(before));
  delete value.draftTerms;
  cases.push({
    function: "update_recurring_expense_rule",
    actor,
    reason: "versioned-replay-retains-all-draft-terms",
    ...value,
  });
}

function pauseFlow(db, cases, actor, baseline) {
  const value = flow(db, actor, {
    expression: recurringActive(),
    observation: `jsonb_build_object(
    'authority',${financialCounts},'active',(select active from public.recurring_expense_rules where id='${id(900)}'),
    'drafts',(select count(*) from public.expense_drafts))`,
  });
  draftOnly(value, baseline);
  assert.equal(value.active, false);
  assert.equal(value.drafts, 3);
  cases.push({
    function: "set_recurring_expense_rule_active",
    actor,
    reason: "pause-replay-without-ledger-posting",
    ...value,
  });
}

function generateFlow(db, cases, actor, baseline) {
  const value = flow(db, actor, {
    expression: recurringGenerate(),
    observation: `jsonb_build_object(
    'authority',${financialCounts},'dates',(select jsonb_agg(occurred_on order by occurred_on)
      from public.expense_drafts where recurring_expense_rule_id='${id(900)}' and occurred_on>'2026-01-31'),
    'pending',(select count(*) from public.expense_drafts where status='pending'),
    'next',(select next_occurrence_on from public.recurring_expense_rules where id='${id(900)}'),
    'inactiveDrafts',(select count(*) from public.expense_drafts where recurring_expense_rule_id='${id(901)}'))`,
  });
  draftOnly(value, baseline);
  assert.deepEqual(value.dates, ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.equal(value.pending, 4);
  assert.equal(value.next, "2026-05-31");
  assert.equal(value.inactiveDrafts, 0);
  cases.push({
    function: "generate_due_recurring_drafts",
    actor,
    reason: "month-end-catchup-replay-no-posting",
    ...value,
  });
}

function confirmFlow(db, cases, actor, baseline) {
  const value = flow(db, actor, {
    expression: recurringConfirm(),
    observation: `jsonb_build_object(
    'events',(select count(*) from public.financial_events),
    'linked',(select count(*) from public.financial_events where expense_draft_id='${id(910)}' and amount_cents=101),
    'status',(select status from public.expense_drafts where id='${id(910)}'),
    'allocations',(select jsonb_agg(allocated_cents order by member_id) from public.financial_allocations
      where financial_event_id=(select id from public.financial_events where expense_draft_id='${id(910)}')),
    'ledger',(select jsonb_agg(receivable_delta_cents order by member_id) from public.ledger_entries
      where financial_event_id=(select id from public.financial_events where expense_draft_id='${id(910)}')))`,
  });
  assert.equal(value.events, baseline.events + 1);
  assert.equal(value.linked, 1);
  assert.equal(value.status, "posted");
  assert.deepEqual(value.allocations, [51, 50]);
  assert.deepEqual(value.ledger, [50, -50]);
  cases.push({
    function: "confirm_expense_draft",
    actor,
    reason: "ordinary-confirmation-one-zero-sum-entry",
    ...value,
  });
}

function dismissFlow(db, cases, actor, baseline) {
  const value = flow(db, actor, {
    expression: recurringDismiss(),
    observation: `jsonb_build_object(
    'authority',${financialCounts},'status',(select status from public.expense_drafts where id='${id(910)}'),
    'amount',(select amount_cents from public.expense_drafts where id='${id(910)}'),
    'linked',(select count(*) from public.financial_events where expense_draft_id='${id(910)}'))`,
  });
  draftOnly(value, baseline);
  assert.equal(value.status, "dismissed");
  assert.equal(value.amount, 101);
  assert.equal(value.linked, 0);
  cases.push({
    function: "dismiss_expense_draft",
    actor,
    reason: "dismissal-replay-retains-terms-no-posting",
    ...value,
  });
}
