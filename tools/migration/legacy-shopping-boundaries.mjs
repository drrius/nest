import assert from "node:assert/strict";
import {
  shoppingBoundaryId as id,
  shoppingSession,
  shoppingClaimedItem,
  shoppingBoundaryFixture,
  shoppingBoundaryCalls,
  shoppingBoundaryVariants,
  invalidShoppingBoundaryCalls,
} from "./legacy-shopping-boundary-calls.mjs";

function stateSql() {
  return `select jsonb_build_object(
    'items',(select jsonb_agg(to_jsonb(g) order by id) from public.grocery_items g),
    'sessions',(select jsonb_agg(to_jsonb(s) order by id) from public.shopping_sessions s),
    'claims',(select jsonb_agg(to_jsonb(c) order by shopping_session_id,grocery_item_id) from public.shopping_session_items c),
    'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.meal_grocery_command_receipts r),
    'drafts',(select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l),
    'allocations',(select jsonb_agg(to_jsonb(a) order by financial_event_id,member_id) from public.financial_allocations a))`;
}

function run(db, actor, sql, { role = "authenticated", setup = "" } = {}) {
  return db.sql(`begin; ${shoppingBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

function denied(db, cases, { name, expression, actor = 1, reason, expected, ...options }) {
  assert.throws(
    () => run(db, actor, `select ${expression}`, options),
    (error) => {
      assert.match(error.stderr?.toString() ?? error.message, expected);
      return true;
    },
  );
  cases.push({
    function: name,
    actor,
    role: options.role ?? "authenticated",
    reason,
    denied: true,
  });
}

export function verifyLegacyShoppingBoundaries(db) {
  const before = db.sql(stateSql()),
    cases = [],
    calls = shoppingBoundaryCalls(1);
  for (const { name, expression, foreign } of calls) {
    for (const actor of [9941, 9943, null])
      denied(db, cases, {
        name,
        expression,
        actor,
        reason: "foreign-or-absent-member",
        expected: /not a member|cannot use|cannot cancel|cannot finish/,
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
        expected: /not a member|cannot use|cannot cancel|cannot finish/,
      });
  }
  for (const actor of [1, 2]) {
    for (const [name, expression, reason, expected] of invalidShoppingBoundaryCalls(actor))
      denied(db, cases, { name, expression, actor, reason, expected });
    memberFlows(db, cases, {
      actor,
      calls: [...shoppingBoundaryCalls(actor), ...shoppingBoundaryVariants(actor)],
    });
  }
  assert.equal(db.sql(stateSql()), before, "Rolled-back shopping probes changed retained history");
  return {
    passed: true,
    cases,
    compiledPublicFunctions: functionMetadata(db, calls),
    compiledPrivateHelpers: privateFunctionMetadata(db),
    exactOriginalGroceriesSessionsClaimsDraftsReceiptsAndFinanceRetained: true,
    disposableOnly: true,
    legacySessionWorkflowNotNativeFeature: true,
    hostedMemberAndConcurrentExecutionNotClaimed: true,
  };
}

function privateFunctionMetadata(db) {
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in (
      'private.is_household_member(uuid)'::regprocedure,
      'private.get_meal_grocery_command_result(uuid,text,text,jsonb)'::regprocedure)`),
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.securityDefiner, true);
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, row.name === "is_household_member");
  }
  return rows;
}

function memberFlows(db, cases, { actor, calls }) {
  for (const call of calls) {
    const actual = JSON.parse(run(db, actor, memberFlowSql(call, actor), call));
    verifyMemberState(actual, call);
    cases.push({ function: call.name, actor, variant: call.variant ?? "default", ...actual });
    if (call.changed)
      denied(db, cases, {
        name: call.name,
        actor,
        expression: call.changed,
        setup: `${call.setup ?? ""} set local request.jwt.claim.sub='${id(actor)}'; select ${call.expression};`,
        reason: "changed-idempotent-payload",
        expected: /idempotency key.*different command/,
      });
    denied(db, cases, {
      name: call.name,
      actor: 9941,
      expression: call.expression,
      setup: `${call.setup ?? ""} set local request.jwt.claim.sub='${id(actor)}'; select ${call.expression};`,
      reason: "nonmember-historical-retry",
      expected: /not a member|cannot use|cannot cancel|cannot finish/,
    });
  }
}

function verifyMemberState(actual, call) {
  assert.equal(actual.sameStateAfterRetry, true, call.name);
  assert.equal(actual.financeUnchanged, true, call.name);
  assert.equal(actual.state, call.state, call.name);
  assert.equal(actual.finished, call.finished ?? false, call.name);
  assert.equal(actual.cancelled, call.cancelled ?? false, call.name);
  assert.equal(actual.addedSessions, call.addedSessions ?? 0, call.name);
  assert.equal(actual.addedDrafts, call.drafts ?? 0, call.name);
  assert.equal(actual.addedReceipts, call.receipt ? 1 : 0, call.name);
  assert.equal(actual.addedActivity, call.activity ?? 0, call.name);
  if (call.receipt) assert.equal(actual.sameResult, true, call.name);
  if (call.name === "start_shopping_session") assert.equal(actual.sameSessionId, true);
}

function memberFlowSql(call, actor) {
  const item = call.item ? id(call.item) : shoppingClaimedItem(actor);
  return `reset role; create temp table shopping_before as ${stateSql()}; set local role authenticated;
    create temp table shopping_results as select ${call.expression} as result;
    reset role; create temp table shopping_after as ${stateSql()}; set local role authenticated;
    insert into shopping_results select ${call.expression}; reset role;
    create temp table shopping_retry as ${stateSql()};
    select jsonb_build_object(
      'sameStateAfterRetry',(select * from shopping_after)=(select * from shopping_retry),
      'financeUnchanged',${financeEqualSql()},
      'sameResult',(select count(distinct result)=1 from shopping_results),
      'sameSessionId',(select count(distinct result->>'shopping_session_id')=1 from shopping_results),
      'state',(select state from public.grocery_items where id='${item}'),
      'finished',(select finished_at is not null from public.shopping_sessions where id='${shoppingSession(actor)}'),
      'cancelled',(select cancelled_at is not null from public.shopping_sessions where id='${shoppingSession(actor)}'),
      'addedSessions',${deltaSql("sessions")},'addedDrafts',${deltaSql("drafts")},
      'addedReceipts',${deltaSql("receipts")},'addedActivity',${deltaSql("activity")})`;
}

function deltaSql(field) {
  return `jsonb_array_length(coalesce(nullif((select * from shopping_after)->'${field}','null'::jsonb),'[]'::jsonb))
    -jsonb_array_length(coalesce(nullif((select * from shopping_before)->'${field}','null'::jsonb),'[]'::jsonb))`;
}

function financeEqualSql() {
  return ["finance", "ledger", "allocations"]
    .map(
      (field) =>
        `((select * from shopping_before)->'${field}') is not distinct from ((select * from shopping_after)->'${field}')`,
    )
    .join(" and ");
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
