import assert from "node:assert/strict";
import {
  calendarBoundaryId as id,
  calendarBoundaryFixture,
  calendarBoundaryCalls,
  calendarBoundaryLease,
  calendarBoundaryRemote,
} from "./legacy-calendar-boundary-calls.mjs";

function stateSql() {
  return `select jsonb_build_object(
    'connections',(select jsonb_agg(to_jsonb(c) order by id) from public.calendar_connections c),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.calendar_events e),
    'finance',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'allocations',(select jsonb_agg(to_jsonb(a) order by financial_event_id,member_id) from public.financial_allocations a),
    'ledger',(select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l),
    'consent',(select jsonb_agg(to_jsonb(c) order by household_id,actor_id) from public.nest_calendar_consent c),
    'busy',(select jsonb_agg(to_jsonb(b) order by household_id,actor_id) from public.nest_busy_snapshots b))`;
}

function run(db, actor, sql, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${calendarBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

function denied(
  db,
  cases,
  call,
  { actor, reason, expected, expression = call.expression, setup = call.setup, role },
) {
  assert.throws(() => run(db, actor, `select ${expression}`, { setup, role }), expected);
  cases.push({ function: call.name, actor, reason, denied: true, role: role ?? "authenticated" });
}

export function verifyLegacyCalendarBoundaries(db) {
  const before = db.sql(stateSql()),
    cases = [],
    calls = calendarBoundaryCalls();
  for (const call of calls) {
    for (const actor of [9971, 9973, null])
      denied(db, cases, call, {
        actor: actor,
        reason: "foreign-or-absent-member",
        expected: /calendar access denied/,
      });
    denied(db, cases, call, {
      actor: 1,
      reason: "anonymous-execution",
      expected: /permission denied/,
      expression: call.expression,
      setup: call.setup,
      role: "anon",
    });
    for (const actor of [1, 2]) {
      denied(db, cases, call, {
        actor: actor,
        reason: "foreign-connection",
        expected: /calendar access denied/,
        expression: call.foreign,
      });
      denied(db, cases, call, {
        actor: actor,
        reason: "missing-connection",
        expected: /calendar access denied/,
        expression: call.expression.replace(id(1322), id(9999)),
      });
    }
  }
  leaseRefusals(db, cases, calls);
  snapshotRefusals(db, cases, calls);
  terminalRetryRefusals(db, cases, calls);
  memberFlows(db, cases, calls);
  assert.equal(db.sql(stateSql()), before, "Rolled-back calendar probes changed retained state");
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db, calls),
    exactOriginalCalendarFinanceAndNativePrivacyStateRetained: true,
    disposableOnly: true,
    legacyHouseholdSharedCalendarNotNativePersonalCalendar: true,
    liveCalDAVCredentialsNetworkAndHostedMutationNotClaimed: true,
  };
}

function leaseRefusals(db, cases, calls) {
  for (const call of calls.filter((c) => c.leased)) {
    for (const actor of [1, 2]) {
      for (const token of ["null", `'${id(9980)}'`])
        denied(db, cases, call, {
          actor: actor,
          reason: "missing-or-wrong-lease",
          expected: /calendar sync lease expired/,
          expression: call.expression.replace(`'${id(9979)}'`, token),
        });
      denied(db, cases, call, {
        actor: actor,
        reason: "expired-lease",
        expected: /calendar sync lease expired/,
        expression: call.expression,
        setup: `${calendarBoundaryLease} update public.calendar_connections set sync_lock_until=now()-interval '1 second' where id='${id(1322)}';`,
      });
    }
  }
  for (const call of calls.filter((c) => !c.leased))
    for (const actor of [1, 2])
      denied(db, cases, call, {
        actor: actor,
        reason: "active-sync-prevents-claim-or-disconnect",
        expected: /calendar sync already running|wait for calendar sync to finish/,
        expression: call.expression,
        setup: calendarBoundaryLease,
      });
  const push = calls.find((c) => c.name === "record_calendar_push");
  for (const actor of [1, 2])
    denied(db, cases, push, {
      actor: actor,
      reason: "foreign-event-with-valid-own-lease",
      expected: /calendar event no longer belongs to connection/,
      expression: push.expression.replace(id(9975), id(9976)),
    });
}

function snapshotRefusals(db, cases, calls) {
  const call = calls.find((c) => c.name === "reconcile_calendar_snapshot"),
    values = [
      null,
      {},
      [calendarBoundaryRemote({ recurrenceRule: 2 })],
      [calendarBoundaryRemote(), calendarBoundaryRemote()],
      [calendarBoundaryRemote({ uid: "" })],
    ];
  for (const actor of [1, 2])
    for (const value of values) {
      const sql = value === null ? "null" : `'${JSON.stringify(value)}'::jsonb`;
      denied(db, cases, call, {
        actor: actor,
        reason: "invalid-or-duplicate-snapshot",
        expected: /invalid calendar snapshot|duplicate calendar snapshot/,
        expression: `public.reconcile_calendar_snapshot('${id(1322)}','${id(9979)}',${sql})`,
      });
    }
  for (const actor of [1, 2])
    denied(db, cases, call, {
      actor: actor,
      reason: "private-helper-direct-execution",
      expected: /permission denied/,
      expression: `private.require_calendar_lease('${id(1322)}','${id(9979)}')`,
    });
}

function memberFlows(db, cases, calls) {
  for (const actor of [1, 2]) {
    for (const call of calls) {
      const result = JSON.parse(run(db, actor, memberSql(call), { setup: call.setup }));
      assert.equal(result.expectedTransition, true, call.name);
      assert.equal(result.foreignCalendarUnchanged, true, call.name);
      assert.equal(result.financeAndNativePrivacyUnchanged, true, call.name);
      if (replayable(call)) assert.equal(result.sameStateAfterRetry, true, call.name);
      cases.push({ function: call.name, actor, replayable: replayable(call), ...result });
    }
  }
}

function memberSql(call) {
  const invoke =
    call.name === "claim_calendar_sync"
      ? `create temp table boundary_result as select ${call.expression} as result`
      : `select ${call.expression}`;
  const retry = replayable(call)
    ? `set local role authenticated; select ${call.expression}; reset role;`
    : "";
  return `reset role; create temp table boundary_before as ${stateSql()}; set local role authenticated;
    ${invoke}; reset role; create temp table boundary_after as ${stateSql()}; ${retry}
    select jsonb_build_object('expectedTransition',${transitionSql(call.name)},
      'sameStateAfterRetry',(select * from boundary_after)=(${stateSql()}),
      'foreignCalendarUnchanged',
        (select * from boundary_before)->'connections' @> (select jsonb_agg(to_jsonb(c)) from public.calendar_connections c where household_id='${id(9970)}')
        and (select * from boundary_before)->'events' @> (select jsonb_agg(to_jsonb(e)) from public.calendar_events e where household_id='${id(9970)}'),
      'financeAndNativePrivacyUnchanged',
        ((select * from boundary_before)-'connections'-'events')=((${stateSql()})-'connections'-'events'))`;
}

function replayable(call) {
  return ["record_calendar_push", "reconcile_calendar_snapshot"].includes(call.name);
}

function terminalRetryRefusals(db, cases, calls) {
  const patterns = {
    claim_calendar_sync: /calendar sync already running/,
    release_calendar_sync: /calendar sync lease expired/,
    disconnect_calendar: /calendar access denied/,
  };
  for (const call of calls.filter((c) => patterns[c.name]))
    for (const actor of [1, 2])
      denied(db, cases, call, {
        actor,
        reason: "non-replayable-terminal-or-active-lease",
        expected: patterns[call.name],
        expression: `${call.expression}; select ${call.expression}`,
      });
}

function transitionSql(name) {
  const own = `id='${id(1322)}'`,
    event = `id='${id(9975)}'`;
  const transitions = {
    claim_calendar_sync: `exists(select 1 from public.calendar_connections where ${own}
      and sync_lock=(select result from boundary_result) and sync_lock_until>now())`,
    release_calendar_sync: `exists(select 1 from public.calendar_connections where ${own}
      and sync_lock is null and sync_lock_until is null and last_error is null and last_synced_at=now())`,
    reconcile_calendar_snapshot: `exists(select 1 from public.calendar_events where ${event}
      and title='Boundary updated event' and ical_data='synthetic-updated' and sync_state='synced'
      and remote_etag='changed-etag' and starts_at='2026-10-05T12:00Z'::timestamptz)`,
    record_calendar_push: `exists(select 1 from public.calendar_events where ${event}
      and sync_state='synced' and remote_etag='acknowledged-etag' and last_synced_ical='synthetic-original')`,
    disconnect_calendar: `not exists(select 1 from public.calendar_connections where ${own})
      and exists(select 1 from public.calendar_events where ${event} and connection_id is null
      and sync_state='local' and remote_href is null and remote_etag is null)`,
  };
  return transitions[name];
}

function metadata(db, calls) {
  const names = [...calls.map((c) => c.name), "require_calendar_lease"];
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
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.equal(row.securityDefiner, true);
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, row.schema === "public");
  }
  return rows;
}
