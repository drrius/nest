import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { captureExcludedHistory } from "./excluded-rehearsal.mjs";
import {
  contextBoundaryId as id,
  contextOpening,
  contextPost,
  contextAssign,
  contextRead,
  contextInvalidVariants,
} from "./legacy-context-boundary-calls.mjs";

import { denied } from "./legacy-context-boundary-runner.mjs";
import {
  openingFlows,
  postingFlows,
  associationFlows,
  readFlows,
} from "./legacy-context-boundary-flows.mjs";

export function verifyLegacyContextBoundaries(db) {
  const before = captureRehearsal(db),
    excluded = captureExcludedHistory(db),
    receipts = captureContextReceipts(db),
    cases = [];
  accessRefusals(db, cases);
  openingRefusals(db, cases);
  contextRefusals(db, cases);
  openingFlows(db, cases);
  postingFlows(db, cases);
  associationFlows(db, cases);
  readFlows(db, cases);
  assert.equal(compareRehearsal(before, captureRehearsal(db)).passed, true);
  assert.equal(captureExcludedHistory(db), excluded);
  assert.equal(captureContextReceipts(db), receipts);
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db),
    disposableOnly: true,
    originalFinancialReceiptsAndExcludedRowsRetained: true,
    legacyContextManagementNotAddedToNativeProduct: true,
  };
}

function accessRefusals(db, cases) {
  const calls = [
    ["establish_opening_balance", contextOpening(), [1, 9983, null]],
    ["post_contextual_expense", contextPost(), [9981, 9983, null]],
    ["assign_expense_context", contextAssign(), [9981, 9983, null]],
    ["read_household_cost_context", contextRead(), [9981, 9983, null]],
  ];
  for (const [name, expression, actors] of calls) {
    for (const actor of actors)
      denied(db, cases, {
        name: name,
        expression: expression,
        reason: "foreign-or-absent-member",
        expected: /not a member of household|Cost context unavailable/,
        actor: actor,
      });
    denied(db, cases, {
      name: name,
      expression: expression,
      reason: "anonymous-execution",
      expected: /permission denied/,
      actor: 1,
      setup: "",
      role: "anon",
    });
  }
  for (const actor of [1, 2]) {
    denied(db, cases, {
      name: "post_contextual_expense",
      expression: contextPost({ context: 9984 }),
      reason: "foreign-context",
      expected: /Expense context unavailable/,
      actor: actor,
    });
    denied(db, cases, {
      name: "assign_expense_context",
      expression: contextAssign({ context: 9984 }),
      reason: "foreign-context",
      expected: /Expense context unavailable/,
      actor: actor,
    });
    denied(db, cases, {
      name: "read_household_cost_context",
      expression: contextRead({ context: 9984 }),
      reason: "foreign-context",
      expected: /Cost context unavailable/,
      actor: actor,
    });
    for (const table of ["contextual_expense_receipts", "expense_context_change_receipts"])
      denied(db, cases, {
        name: table,
        expression: `count(*) from private.${table}`,
        reason: "private-receipt-table-direct-read",
        expected: /permission denied/,
        actor: actor,
      });
  }
}

function openingRefusals(db, cases) {
  const name = "establish_opening_balance";
  for (const actor of [9981, 9982]) {
    for (const amount of [-1, 9007199254740992])
      denied(db, cases, {
        name: name,
        expression: contextOpening({ amount }),
        reason: "invalid-centimes",
        expected: /safe integer/,
        actor: actor,
      });
    denied(db, cases, {
      name: name,
      expression: contextOpening({ creditor: 1 }),
      reason: "foreign-creditor",
      expected: /foreign key/,
      actor: actor,
    });
    denied(db, cases, {
      name: name,
      expression: contextOpening({ key: null }),
      reason: "missing-retry-key",
      expected: /idempotency key/i,
      actor: actor,
    });
    const setup = `set local request.jwt.claim.sub='${id(actor)}'; select ${contextOpening()};`;
    denied(db, cases, {
      name: name,
      expression: contextOpening({ note: "Changed" }),
      reason: "changed-retry-payload",
      expected: /different command/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: name,
      expression: contextOpening({ key: "second-opening" }),
      reason: "second-opening-preserves-original",
      expected: /financial_events_one_opening_balance_idx/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: name,
      expression: contextOpening(),
      reason: "nonmember-historical-retry",
      expected: /not a member of household/,
      actor: 1,
      setup: setup,
    });
  }
  for (const actor of [1, 2])
    denied(db, cases, {
      name: name,
      expression: contextOpening({ household: 10, creditor: 1 }),
      reason: "retained-opening-cannot-reset",
      expected: /financial_events_one_opening_balance_idx/,
      actor: actor,
    });
}

function contextRefusals(db, cases) {
  const variants = contextInvalidVariants();
  for (const actor of [1, 2]) {
    for (const [name, expression, reason, expected] of variants)
      denied(db, cases, {
        name: name,
        expression: expression,
        reason: reason,
        expected: expected,
        actor: actor,
      });
    const setup = `update public.household_projects set archived_at=now() where id='${id(1300)}';`;
    denied(db, cases, {
      name: "post_contextual_expense",
      expression: contextPost(),
      reason: "archived-context",
      expected: /Reopen the archived context/,
      actor: actor,
      setup: setup,
    });
    denied(db, cases, {
      name: "assign_expense_context",
      expression: contextAssign(),
      reason: "archived-context",
      expected: /Restore this record/,
      actor: actor,
      setup: setup,
    });
  }
}

function metadata(db) {
  const names = [
    "establish_opening_balance",
    "post_contextual_expense",
    "assign_expense_context",
    "read_household_cost_context",
    "require_money_actor",
    "post_financial_event",
    "get_money_command_result",
    "store_money_command_result",
    "validate_money_allocations",
    "other_household_member",
    "revise_expense_context_link",
  ];
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname in (${names.map((n) => `'${n}'`).join(",")})`),
  );
  assert.equal(rows.length, 11);
  for (const row of rows) {
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, row.schema === "public");
    assert.equal(row.securityDefiner, row.name !== "revise_expense_context_link");
  }
  return rows;
}

function captureContextReceipts(db) {
  return db.sql(`select jsonb_build_object(
    'post',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from private.contextual_expense_receipts r),
    'association',(select jsonb_agg(to_jsonb(r) order by household_id,request_id) from private.expense_context_change_receipts r),
    'money',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.money_command_receipts r))`);
}
