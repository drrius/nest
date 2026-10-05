import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { captureExcludedHistory } from "./excluded-rehearsal.mjs";
import { captureRecurringHistory } from "./recurring-rehearsal.mjs";
import { denyRecurringBoundary as denied } from "./legacy-recurring-boundary-runner.mjs";
import { recurringFlows } from "./legacy-recurring-boundary-flows.mjs";
import {
  recurringBoundaryId as id,
  recurringAllocations,
  recurringCreate,
  recurringUpdate,
  recurringActive,
  recurringGenerate,
  recurringConfirm,
  recurringDismiss,
  recurringAdoptionFenceSeed,
} from "./legacy-recurring-boundary-calls.mjs";

const calls = [
  ["create_recurring_expense_rule", recurringCreate()],
  ["update_recurring_expense_rule", recurringUpdate()],
  ["set_recurring_expense_rule_active", recurringActive()],
  ["generate_due_recurring_drafts", recurringGenerate()],
  ["confirm_expense_draft", recurringConfirm()],
  ["dismiss_expense_draft", recurringDismiss()],
];

export function verifyLegacyRecurringBoundaries(db) {
  const before = captureRehearsal(db),
    excluded = captureExcludedHistory(db);
  const recurring = captureRecurringHistory(db),
    receipts = captureReceipts(db),
    cases = [];
  accessRefusals(db, cases);
  termRefusals(db, cases);
  stateRefusals(db, cases);
  recurringFlows(db, cases);
  assert.equal(compareRehearsal(before, captureRehearsal(db)).passed, true);
  assert.equal(captureExcludedHistory(db), excluded);
  assert.equal(captureRecurringHistory(db), recurring);
  assert.equal(captureReceipts(db), receipts);
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db),
    disposableOnly: true,
    originalFinancialRecurringReceiptsAndExcludedRowsRetained: true,
    scheduledPostingActivated: false,
    adoptionFixtureProvesGuardsOnly: true,
  };
}

function accessRefusals(db, cases) {
  for (const actor of [1, 2])
    denied(db, cases, {
      name: "update_recurring_expense_rule",
      actor,
      expression: recurringUpdate().replace(
        "(select updated_at from pg_temp.recurring_boundary_version),",
        "",
      ),
      reason: "obsolete-unversioned-overload",
      expected: /permission denied/,
    });
  for (const [name, expression] of calls) {
    for (const actor of [9951, 9953, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "foreign-or-absent-member",
        expected: /not a member of household/,
      });
    denied(db, cases, {
      name,
      expression,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
  }
  for (const actor of [1, 2])
    for (const [name, expression] of calls)
      denied(db, cases, {
        name,
        expression: expression.replace(/'boundary-[a-z]+'/u, "null"),
        actor,
        reason: "missing-retry-key",
        expected: /idempotency key/i,
      });
}

function termRefusals(db, cases) {
  const variants = [
    [{ amount: -1 }, /safe integer/, "negative-centimes"],
    [{ amount: 9007199254740992 }, /safe integer/, "unsafe-centimes"],
    [{ description: "" }, /description/, "blank-description"],
    [{ payer: 9951 }, /not a household member|not a member|foreign key/, "foreign-payer"],
    [
      { allocations: recurringAllocations(9951) },
      /allocations|member|household/i,
      "foreign-allocation",
    ],
    [{ allocations: "[]" }, /allocations/i, "missing-split"],
    [{ next: null }, /required/, "missing-date"],
    [{ monthday: 32 }, /day of month/, "invalid-month-day"],
    [{ next: "2026-02-27" }, /match/, "wrong-month-end"],
    [{ schedule: "weekly", monthday: "null", weekday: 0 }, /weekday/, "invalid-weekday"],
    [{ schedule: "weekly", monthday: "null", weekday: 1 }, /weekday/, "wrong-weekday-date"],
    [{ schedule: "yearly" }, /unknown/, "unknown-schedule"],
    [{ category: `'${id(9954)}'` }, /foreign key|household category/, "foreign-category"],
  ];
  for (const actor of [1, 2])
    for (const [name, build] of [
      ["create_recurring_expense_rule", recurringCreate],
      ["update_recurring_expense_rule", recurringUpdate],
    ])
      for (const [options, expected, reason] of variants)
        denied(db, cases, { name, expression: build(options), actor, reason, expected });
}

function stateRefusals(db, cases) {
  const variants = [
    [
      "update_recurring_expense_rule",
      recurringUpdate({ version: "null" }),
      /Reload/,
      "missing-edit-version",
    ],
    [
      "update_recurring_expense_rule",
      recurringUpdate({ version: "'2000-01-01'::timestamptz" }),
      /changed/,
      "stale-edit-version",
    ],
    [
      "set_recurring_expense_rule_active",
      recurringActive({ active: "null" }),
      /required/,
      "missing-active-state",
    ],
    [
      "generate_due_recurring_drafts",
      recurringGenerate({ date: null }),
      /required/,
      "missing-as-of-date",
    ],
    ["confirm_expense_draft", recurringConfirm({ draft: 911 }), /only pending/, "dismissed-draft"],
    [
      "confirm_expense_draft",
      recurringConfirm({ draft: 912 }),
      /only pending/,
      "already-posted-draft",
    ],
    ["dismiss_expense_draft", recurringDismiss({ draft: 912 }), /posted.*cannot/, "posted-history"],
    [
      "confirm_expense_draft",
      recurringConfirm({ amount: -1 }),
      /safe integer/,
      "invalid-confirmed-centimes",
    ],
    [
      "confirm_expense_draft",
      recurringConfirm({ payer: `'${id(9951)}'` }),
      /member|foreign key/,
      "foreign-confirmed-payer",
    ],
    [
      "confirm_expense_draft",
      recurringConfirm({ allocations: recurringAllocations(9951) }),
      /allocations|member/i,
      "foreign-confirmed-split",
    ],
  ];
  for (const actor of [1, 2]) {
    for (const [name, expression, expected, reason] of variants)
      denied(db, cases, { name, expression, expected, reason, actor });
    for (const [name, expression] of calls.slice(1))
      denied(db, cases, {
        name,
        expression,
        actor,
        setup: recurringAdoptionFenceSeed(),
        reason: "adopted-source-fence",
        expected: /Legacy rule adopted/,
      });
    changedRetries(db, cases, actor);
  }
}

function changedRetries(db, cases, actor) {
  const variants = [
    [calls[0], recurringCreate({ description: "Changed" })],
    [calls[1], recurringUpdate({ description: "Changed" })],
    [calls[2], recurringActive({ active: "true" })],
    [calls[3], recurringGenerate({ date: "2026-05-31" })],
    [calls[4], recurringConfirm({ amount: 100 })],
    [calls[5], recurringDismiss({ draft: 911 })],
  ];
  for (const [[name, original], expression] of variants)
    denied(db, cases, {
      name,
      expression,
      actor,
      reason: "changed-retry-payload",
      setup: `set local request.jwt.claim.sub='${id(actor)}'; select ${original};`,
      expected: /different command/,
    });
}

function captureReceipts(db) {
  return db.sql(`select coalesce(jsonb_agg(to_jsonb(r) order by household_id,idempotency_key),'[]')
    from public.money_command_receipts r`);
}

function metadata(db) {
  const names = [
    ...calls.map(([name]) => name),
    "nest_assert_legacy_rule_open",
    "nest_guard_legacy_recurring_write",
    "nest_guard_legacy_draft_write",
    "advance_recurring_expense_version",
  ];
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname,p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in (${names.map((n) => `'${n}'`).join(",")})`),
  );
  assert.equal(rows.length, 11);
  for (const row of rows) {
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    const oldUpdate =
      row.name === "update_recurring_expense_rule" &&
      !row.signature.includes("timestamp with time zone");
    assert.equal(row.authenticatedExecute, row.schema === "public" && !oldUpdate);
    assert.equal(row.securityDefiner, row.name !== "advance_recurring_expense_version");
  }
  return rows;
}
