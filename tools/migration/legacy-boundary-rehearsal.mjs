import assert from "node:assert/strict";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ownConnection = id(1322);
const lease = id(9400);
const search = "public.search_household('Retained legacy event',array['calendar'])";
const usage = "public.household_attachment_usage()";
const calls = [
  ["claim_calendar_sync", `public.claim_calendar_sync('${ownConnection}')`],
  ["disconnect_calendar", `public.disconnect_calendar('${ownConnection}')`],
  ["release_calendar_sync", `public.release_calendar_sync('${ownConnection}','${lease}')`],
  [
    "reconcile_calendar_snapshot",
    `public.reconcile_calendar_snapshot('${ownConnection}','${lease}','[]')`,
  ],
  ["record_calendar_push", push(id(1320), lease)],
];

function push(event, token) {
  return `public.record_calendar_push('${ownConnection}','${token}','${event}',
    'synthetic-ical',false,'https://example.invalid/boundary.ics','synthetic-etag')`;
}

function fixtureSql() {
  return `insert into auth.users(id) values('${id(9301)}'),('${id(9302)}'),('${id(9303)}');
    insert into public.households(id,name) values('${id(9300)}','Boundary-only foreign household');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9300)}','${id(9301)}','Foreign first'),('${id(9300)}','${id(9302)}','Foreign second');
    insert into public.calendar_connections(id,household_id,connected_by,encrypted_credentials)
      values('${id(9310)}','${id(9300)}','${id(9301)}','synthetic-ciphertext-not-a-credential');
    insert into public.calendar_events(id,household_id,created_by,title,starts_at,ends_at)
      values('${id(9311)}','${id(9300)}','${id(9301)}','Foreign lease sentinel',
        '2026-09-21T10:00:00Z','2026-09-21T11:00:00Z');
    update public.calendar_events set connection_id='${id(9310)}',sync_state='synced' where id='${id(9311)}';
    set local request.jwt.claim.sub='${id(9301)}';
    do $boundary$ begin
      perform public.reserve_household_attachment('${id(9300)}/receipts/${id(9320)}.jpg','image/jpeg');
    end $boundary$;
    insert into storage.objects(bucket_id,name,metadata)
      values('household-files','${id(9300)}/receipts/${id(9320)}.jpg','{"mimetype":"image/jpeg","size":909}');
    update public.calendar_connections set sync_lock='${lease}',sync_lock_until=now()+interval '1 minute'
      where id='${ownConnection}';`;
}

function run(db, actor, expression, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${fixtureSql()} ${setup}
    set local role ${role}; set local request.jwt.claim.sub='${id(actor)}';
    select ${expression}; rollback;`);
}

function preserved(db) {
  return db.sql(`select jsonb_build_object(
    'connections',(select jsonb_agg(to_jsonb(c) order by id) from public.calendar_connections c),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.calendar_events e),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o),
    'members',(select jsonb_agg(to_jsonb(m) order by household_id,user_id) from public.household_members m),
    'households',(select jsonb_agg(to_jsonb(h) order by id) from public.households h))`);
}

export function verifyLegacyBoundaries(db) {
  const baseline = preserved(db),
    cases = [];
  const denied = (name, actor, expression, options) => {
    assert.throws(() => run(db, actor, expression, options), options.expected);
    cases.push({ function: name, actor, role: options.role ?? "authenticated", denied: true });
  };
  for (const [name, expression] of calls) {
    denied(name, 9301, expression, { expected: /calendar access denied/ });
    denied(name, 9303, expression, { expected: /calendar access denied/ });
    denied(name, 9301, expression, { expected: /permission denied/, role: "anon" });
  }
  for (const actor of [1, 2]) {
    const result = JSON.parse(run(db, actor, search));
    assert.deepEqual(
      result.results.map((r) => r.id),
      [id(1320)],
    );
    cases.push({ function: "search_household", actor, onlyOwnCalendarReturned: true });
    const total = db.sql(`begin; set local role authenticated;
      set local request.jwt.claim.sub='${id(actor)}'; select ${usage}; rollback;`);
    assert.equal(run(db, actor, usage), total);
    cases.push({ function: "household_attachment_usage", actor, foreignStorageExcluded: true });
  }
  assert.deepEqual(JSON.parse(run(db, 9301, search)).results, []);
  assert.equal(run(db, 9301, usage), "909");
  cases.push({ function: "search_household", actor: 9301, ownFixtureNotForeignCalendar: true });
  cases.push({ function: "household_attachment_usage", actor: 9301, onlyOwnStorageCounted: true });
  denied("search_household", 9303, search, { expected: /household access denied/ });
  denied("household_attachment_usage", 9303, usage, { expected: /Household membership required/ });
  for (const [name, expression] of [
    ["search_household", search],
    ["household_attachment_usage", usage],
  ])
    denied(name, 1, expression, { expected: /permission denied/, role: "anon" });
  verifyLeases(db, denied, cases);
  assert.equal(preserved(db), baseline, "Boundary checks must preserve all original rows");
  return {
    passed: true,
    cases,
    originalCalendarStorageAndTenancyUnchanged: true,
    disposableOnly: true,
    realAuthStorageOrCalendarSyncNotClaimed: true,
  };
}

function verifyLeases(db, denied, cases) {
  const expired = `update public.calendar_connections set sync_lock_until=now()-interval '1 second'
    where id='${ownConnection}';`;
  for (const [name, expression] of calls.slice(2))
    denied(name, 1, expression, { expected: /calendar sync lease expired/, setup: expired });
  denied(
    "release_calendar_sync",
    1,
    `public.release_calendar_sync('${ownConnection}','${id(9401)}')`,
    { expected: /calendar sync lease expired/ },
  );
  denied("record_calendar_push", 1, push(id(9311), lease), {
    expected: /calendar event no longer belongs/,
  });
  denied("claim_calendar_sync", 2, calls[0][1], { expected: /calendar sync already running/ });
  const unlocked = `update public.calendar_connections set sync_lock=null,sync_lock_until=null
    where id='${ownConnection}';`;
  for (const [name, expression] of [calls[0], calls[1], ...calls.slice(2)]) {
    const setup = name === "claim_calendar_sync" || name === "disconnect_calendar" ? unlocked : "";
    run(db, 2, expression, { setup });
    cases.push({ function: name, actor: 2, authorizedPartnerSucceeded: true, rolledBack: true });
  }
}
