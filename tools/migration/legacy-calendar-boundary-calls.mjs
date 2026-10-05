const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const calendarBoundaryId = id;
export const calendarBoundaryLease = `update public.calendar_connections
  set sync_lock='${id(9979)}',sync_lock_until=now()+interval '60 seconds'
  where id='${id(1322)}';`;

export function calendarBoundaryFixture() {
  return `insert into auth.users(id) values('${id(9971)}'),('${id(9972)}'),('${id(9973)}');
    insert into public.households(id,name) values('${id(9970)}','Foreign calendar boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9970)}','${id(9971)}','Foreign first'),('${id(9970)}','${id(9972)}','Foreign second');
    insert into public.calendar_connections(id,household_id,connected_by,encrypted_credentials)
      values('${id(9974)}','${id(9970)}','${id(9971)}','synthetic-ciphertext-not-a-credential');
    insert into public.calendar_events(id,household_id,created_by,title,starts_at,ends_at,
      ical_uid,ical_data,connection_id,sync_state,remote_href,remote_etag,last_synced_ical)
      values('${id(9975)}','${id(10)}','${id(1)}','Boundary own event','2026-10-05T10:00Z',
        '2026-10-05T11:00Z','boundary-own@invalid','synthetic-original','${id(1322)}',
        'synced','https://example.invalid/own.ics','original-etag','synthetic-original'),
        ('${id(9976)}','${id(9970)}','${id(9971)}','Boundary foreign event','2026-10-05T10:00Z',
        '2026-10-05T11:00Z','boundary-foreign@invalid','synthetic-foreign','${id(9974)}',
        'synced','https://example.invalid/foreign.ics','foreign-etag','synthetic-foreign');`;
}

export function calendarBoundaryRemote(patch = {}) {
  return {
    uid: "boundary-own@invalid",
    href: "https://example.invalid/own.ics",
    etag: "changed-etag",
    ical: "synthetic-updated",
    title: "Boundary updated event",
    startsAt: "2026-10-05T12:00:00Z",
    endsAt: "2026-10-05T13:00:00Z",
    timeZone: "Europe/Zurich",
    allDay: false,
    cancelled: false,
    location: "Fictional location",
    notes: "Fictional notes",
    ...patch,
  };
}

export function calendarBoundaryCalls() {
  const token = `'${id(9979)}'`,
    connection = `'${id(1322)}'`;
  return [
    { name: "claim_calendar_sync", args: connection, setup: "", leased: false },
    { name: "release_calendar_sync", args: `${connection},${token},null`, leased: true },
    {
      name: "reconcile_calendar_snapshot",
      args: `${connection},${token},'${JSON.stringify([calendarBoundaryRemote()])}'::jsonb`,
      leased: true,
    },
    {
      name: "record_calendar_push",
      args: `${connection},${token},'${id(9975)}','synthetic-original',false,
        'https://example.invalid/own.ics','acknowledged-etag'`,
      leased: true,
    },
    { name: "disconnect_calendar", args: connection, setup: "", leased: false },
  ].map((call) => ({
    ...call,
    setup: call.leased ? calendarBoundaryLease : "",
    expression: `public.${call.name}(${call.args})`,
    foreign: `public.${call.name}(${call.args.replace(connection, `'${id(9974)}'`)})`,
  }));
}
