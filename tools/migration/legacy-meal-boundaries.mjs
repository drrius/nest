import assert from "node:assert/strict";
import {
  mealBoundaryId as id,
  mealBoundaryFixture,
  mealBoundaryCalls,
  mealBoundaryPlacementVariants,
  invalidMealBoundaryCalls,
} from "./legacy-meal-boundary-calls.mjs";

function stateSql() {
  return `select jsonb_build_object(
    'recipes',(select jsonb_agg(to_jsonb(r) order by id) from public.meal_definitions r),
    'ingredients',(select jsonb_agg(to_jsonb(i) order by id) from public.meal_grocery_templates i),
    'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e),
    'groceries',(select jsonb_agg(to_jsonb(g) order by id) from public.grocery_items g),
    'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.meal_grocery_command_receipts r),
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r),
    'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
    'weekRevisions',(select jsonb_agg(to_jsonb(r) order by household_id,week_start) from public.nest_meal_week_revisions r),
    'libraryRevisions',(select jsonb_agg(to_jsonb(r) order by household_id) from public.nest_meal_library_revisions r),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l),
    'allocations',(select jsonb_agg(to_jsonb(a) order by financial_event_id,member_id) from public.financial_allocations a))`;
}

function run(db, actor, sql, { role = "authenticated", setup = "" } = {}) {
  return db.sql(`begin; ${mealBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

function denied(db, cases, { name, expression, actor = 1, reason, expected, ...options }) {
  assert.throws(() => run(db, actor, `select ${expression}`, options), expected);
  cases.push({
    function: name,
    actor,
    role: options.role ?? "authenticated",
    reason,
    denied: true,
  });
}

export function verifyLegacyMealBoundaries(db) {
  const before = db.sql(stateSql()),
    cases = [],
    calls = mealBoundaryCalls();
  for (const { name, expression, foreign } of calls) {
    for (const actor of [9891, 9893, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "foreign-or-absent-member",
        expected: /not a member|Not a member/,
      });
    denied(db, cases, {
      name,
      expression,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
    for (const actor of [1, 2])
      denied(db, cases, {
        name,
        expression: foreign,
        actor,
        reason: "foreign-target",
        expected: /not a member|Not a member/,
      });
  }
  for (const [name, expression, reason, expected] of invalidMealBoundaryCalls())
    for (const actor of [1, 2]) denied(db, cases, { name, expression, actor, reason, expected });
  memberFlows(db, cases, calls);
  memberFlows(db, cases, mealBoundaryPlacementVariants());
  assert.equal(db.sql(stateSql()), before, "Rolled-back meal probes changed retained records");
  return {
    passed: true,
    cases,
    compiledPublicFunctions: functionMetadata(db, calls),
    exactOriginalMealsGroceriesRoutinesFinanceAndReceiptsRetained: true,
    disposableOnly: true,
    legacyAutomaticIngredientMaterializationNotNativeApproval: true,
    legacySaveUsesSourceLinkRatherThanExactPayloadReceipt: true,
    concurrentAndHostedMemberExecutionNotClaimed: true,
  };
}

function memberFlows(db, cases, calls) {
  for (const actor of [1, 2]) {
    for (const call of calls) {
      const actual = JSON.parse(run(db, actor, memberFlowSql(call)));
      assert.equal(actual.sameReceipt, true);
      assert.equal(actual.sameStateAfterRetry, true);
      assert.equal(actual.sameStateAfterCompetingSave, true);
      assert.equal(actual.relatedRecipeAndIngredients, true);
      for (const field of [
        "Entries",
        "Definitions",
        "Receipts",
        "Routines",
        "Occurrences",
        "Groceries",
      ])
        assert.equal(actual[`added${field}`], call[`added${field}`] ?? 0, `${call.name}: ${field}`);
      cases.push({
        function: call.name,
        actor,
        ...actual,
        usesSourceLinkForRetry: call.usesSourceLinkForRetry ?? false,
        variant: call.variant ?? "default",
      });
      if (!call.usesSourceLinkForRetry)
        denied(db, cases, {
          name: call.name,
          expression: call.changed,
          actor,
          setup: `set local request.jwt.claim.sub='${id(actor)}'; select ${call.expression};`,
          reason: "changed-idempotent-payload",
          expected: /idempotency key.*different command/,
        });
      denied(db, cases, {
        name: call.name,
        expression: call.expression,
        actor: 9891,
        setup: `set local request.jwt.claim.sub='${id(actor)}'; select ${call.expression};`,
        reason: "nonmember-historical-retry",
        expected: /not a member|Not a member/,
      });
    }
  }
}

function countsSql() {
  return `select jsonb_build_object(
    'Entries',(select count(*) from public.meal_plan_entries),
    'Definitions',(select count(*) from public.meal_definitions),
    'Receipts',(select count(*) from public.meal_grocery_command_receipts),
    'Routines',(select count(*) from public.routines),
    'Occurrences',(select count(*) from public.routine_occurrences),
    'Groceries',(select count(*) from public.grocery_items))`;
}

function memberFlowSql(call) {
  return `reset role; create temp table boundary_before as ${countsSql()}; set local role authenticated;
    create temp table boundary_results as select ${call.expression} as result;
    reset role; create temp table boundary_after as ${stateSql()};
    create temp table boundary_counts as ${countsSql()}; set local role authenticated;
    insert into boundary_results select ${call.expression}; reset role;
    create temp table boundary_retry as ${stateSql()};
    ${call.usesSourceLinkForRetry ? `set local role authenticated; insert into boundary_results select ${call.changed}; reset role;` : ""}
    select jsonb_build_object(
      'sameReceipt',(select count(distinct result)=1 from boundary_results),
      'sameStateAfterRetry',(select * from boundary_after)=(select * from boundary_retry),
      'sameStateAfterCompetingSave',(select * from boundary_after)=(${stateSql()}),
      'relatedRecipeAndIngredients',${relatedRecipeSql(call)},
      'addedEntries',((select * from boundary_counts)->>'Entries')::int-((select * from boundary_before)->>'Entries')::int,
      'addedDefinitions',((select * from boundary_counts)->>'Definitions')::int-((select * from boundary_before)->>'Definitions')::int,
      'addedReceipts',((select * from boundary_counts)->>'Receipts')::int-((select * from boundary_before)->>'Receipts')::int,
      'addedRoutines',((select * from boundary_counts)->>'Routines')::int-((select * from boundary_before)->>'Routines')::int,
      'addedOccurrences',((select * from boundary_counts)->>'Occurrences')::int-((select * from boundary_before)->>'Occurrences')::int,
      'addedGroceries',((select * from boundary_counts)->>'Groceries')::int-((select * from boundary_before)->>'Groceries')::int)`;
}

function relatedRecipeSql(call) {
  if (!call.expectedDefinition) return "true";
  const entry = "(select (result->>'meal_plan_entry_id')::uuid from boundary_results limit 1)";
  const leftovers = call.expectedLeftover
    ? `e.leftover_of_entry_id='${id(call.expectedLeftover)}' and e.title_snapshot='Retained meal title'`
    : "e.leftover_of_entry_id is null";
  const groceries = call.addedGroceries
    ? `and exists(select 1 from public.grocery_items g where g.originating_meal_plan_entry_id=e.id
      and g.household_id=e.household_id and g.name='Synthetic ingredient' and g.quantity='250' and g.unit='g')`
    : "and not exists(select 1 from public.grocery_items g where g.originating_meal_plan_entry_id=e.id)";
  return `exists(select 1 from public.meal_plan_entries e where e.id=${entry}
    and e.household_id='${id(10)}' and e.meal_definition_id='${id(call.expectedDefinition)}'
    and ${leftovers} ${groceries})`;
}

function functionMetadata(db, calls) {
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (${calls.map(({ name }) => `'${name}'`).join(",")})`),
  );
  assert.equal(rows.length, calls.length);
  for (const row of rows) {
    assert.equal(row.securityDefiner, true);
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, true);
  }
  return rows;
}
