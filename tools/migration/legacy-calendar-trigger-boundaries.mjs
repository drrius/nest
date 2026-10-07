import assert from "node:assert/strict";
import {
  calendarBoundaryId as id,
  calendarBoundaryFixture,
  calendarBoundaryLease,
} from "./legacy-calendar-boundary-calls.mjs";

const connection = `id='${id(1322)}'`;
const event = `id='${id(9975)}'`;

function snapshot(db) {
  return db.sql(`select jsonb_build_object(
    'connections',(select jsonb_agg(to_jsonb(r) order by id) from public.calendar_connections r),
    'events',(select jsonb_agg(to_jsonb(r) order by id) from public.calendar_events r))`);
}

function run(db, actor, sql, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${calendarBoundaryFixture()} ${setup}
    set local role ${role}; set local request.jwt.claim.sub='${id(actor)}';
    ${sql}; rollback;`);
}

export function verifyLegacyCalendarTriggerBoundaries(db) {
  const before = snapshot(db),
    cases = [];
  for (const actor of [1, 2]) {
    for (const [reason, sql, setup, expected] of refusals()) {
      assert.throws(() => run(db, actor, sql, { setup }), expected);
      cases.push({ actor, reason, denied: true });
    }
    verifyMemberEdit(db, actor, cases);
    for (const helper of ["guard_calendar_connection", "guard_calendar_event_sync"]) {
      assert.throws(
        () => run(db, actor, `select private.${helper}()`),
        /trigger functions can only be called as triggers/,
      );
      cases.push({ actor, helper, ordinaryInvocationDenied: true });
    }
  }
  for (const helper of ["guard_calendar_connection", "guard_calendar_event_sync"]) {
    assert.throws(
      () => run(db, 9973, `select private.${helper}()`, { role: "anon" }),
      /permission denied for schema private/,
    );
    cases.push({ role: "anon", helper, schemaAccessDenied: true });
  }
  for (const actor of [1, 2, 9973]) {
    const changed = JSON.parse(
      run(
        db,
        actor,
        `with
      events as (update public.calendar_events set title='Forbidden direct edit'
        where id='${id(9976)}' returning id),
      connections as (update public.calendar_connections set calendar_name='Forbidden direct edit'
        where id='${id(9974)}' returning id)
      select jsonb_build_object('events',(select count(*) from events),
        'connections',(select count(*) from connections))`,
      ),
    );
    assert.deepEqual(changed, { events: 0, connections: 0 });
    cases.push({ actor, foreignDirectUpdatesExcludedByRLS: true });
  }
  assert.equal(snapshot(db), before, "Trigger probes changed retained calendar rows");
  return { passed: true, cases, originalCalendarRowsRetained: true, disposableOnly: true };
}

function refusals() {
  return [
    [
      "leased-credentials",
      `update public.calendar_connections set encrypted_credentials='replacement-synthetic-ciphertext' where ${connection}`,
      calendarBoundaryLease,
      /wait for calendar sync/,
    ],
    [
      "leased-read-only-change",
      `update public.calendar_connections set read_only=false where ${connection}`,
      calendarBoundaryLease,
      /wait for calendar sync/,
    ],
    [
      "change-selected-calendar",
      `update public.calendar_connections set selected_calendar_url='https://example.invalid/replacement/' where ${connection}`,
      "",
      /disconnect before selecting another calendar/,
    ],
    [
      "connection-identity",
      `update public.calendar_connections set connected_by='${id(2)}' where ${connection}`,
      "",
      /permission denied|identity is immutable/,
    ],
    [
      "remote-acknowledgment",
      `update public.calendar_events set remote_etag='forged-etag' where ${event}`,
      "",
      /remote calendar metadata is owned by sync|permission denied/,
    ],
    [
      "remote-baseline",
      `update public.calendar_events set last_synced_ical='forged-baseline' where ${event}`,
      "",
      /remote calendar baseline is owned by sync|permission denied/,
    ],
    [
      "imported-event-detachment",
      `update public.calendar_events set connection_id=null,sync_state='local' where ${event}`,
      "",
      /disconnect the calendar to detach|permission denied/,
    ],
    [
      "pending-event-acknowledgment",
      `update public.calendar_events set sync_state='synced' where ${event}`,
      `update public.calendar_events set sync_state='pending' where ${event};`,
      /only sync can acknowledge pending calendar edits|permission denied/,
    ],
  ];
}

function verifyMemberEdit(db, actor, cases) {
  const result = JSON.parse(
    run(
      db,
      actor,
      `
    update public.calendar_events set title='Direct member edit',notes='Synthetic local note' where ${event};
    update public.calendar_connections set read_only=false where ${connection};
    select jsonb_build_object(
      'pending',exists(select 1 from public.calendar_events where ${event} and sync_state='pending'
        and ical_data is null and ical_edit_base='synthetic-original'
        and remote_etag='original-etag' and title='Direct member edit'),
      'editable',exists(select 1 from public.calendar_connections where ${connection} and not read_only));`,
    ),
  );
  assert.deepEqual(result, { pending: true, editable: true });
  cases.push({
    actor,
    localEditRequiresSyncAcknowledgment: true,
    unlockedConnectionEditAllowed: true,
  });
}
