import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/busy-fixture.sql");
db.file("supabase/migrations/20260919214955_native_busy_snapshots.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  partner = id(2),
  outsider = id(3),
  household = id(10);
let sequence = 100;
const next = () => id(sequence++);
const as = (user, sql) => `set role authenticated; set request.jwt.claim.sub='${user}'; ${sql}`;
const consent = (version, enabled = true, operation = next()) =>
  `select public.nest_set_calendar_consent('${household}','${operation}',${version},${enabled})`;
const current = () =>
  db.sql(`select version from public.nest_calendar_consent where actor_id='${actor}'`);
const begin = (version) =>
  JSON.parse(db.sql(as(actor, `select public.nest_begin_busy_capture('${household}',${version})`)));
const publish = (lease, intervals = [{ start: 100, end: 200 }], start = 0, end = 1000) =>
  `select public.nest_publish_busy('${household}',${lease.consent},${lease.generation},${start},${end},'${JSON.stringify(intervals)}'::jsonb)`;
const prepare = () => {
  const version = db.sql(as(actor, consent(current() || "0")));
  return begin(version);
};
const visible = (user) =>
  db.sql(as(user, `select count(*) from public.nest_busy_snapshots where actor_id='${actor}'`));

test("sharing is disabled by default; partner cannot see consent or write snapshots directly", () => {
  assert.throws(() => begin("0"), /Calendar sharing changed/);
  const lease = prepare();
  db.sql(as(actor, publish(lease)));
  assert.equal(visible(partner), "1");
  assert.equal(visible(outsider), "0");
  assert.equal(
    db.sql(
      as(partner, `select count(*) from public.nest_calendar_consent where actor_id='${actor}'`),
    ),
    "0",
  );
  assert.throws(
    () => db.sql(as(partner, `update public.nest_busy_snapshots set intervals='[]'`)),
    /permission denied/,
  );
  assert.throws(() => db.sql(`set role anon; ${consent("0")}`), /permission denied/);
});

test("opt-out atomically removes shared data and rejects a late in-flight publication", () => {
  const lease = prepare();
  db.sql(as(actor, publish(lease)));
  db.sql(as(actor, consent(lease.consent, false)));
  assert.equal(
    db.sql(
      as(actor, `select enabled::text from public.nest_calendar_consent where actor_id='${actor}'`),
    ),
    "false",
  );
  assert.equal(visible(partner), "0");
  assert.throws(() => db.sql(as(actor, publish(lease))), /Busy capture superseded/);
  assert.equal(visible(partner), "0");
});

test("changing the selected calendars invalidates older captures even when sharing remains enabled", () => {
  const lease = prepare();
  db.sql(as(actor, publish(lease)));
  db.sql(as(actor, consent(lease.consent, true)));
  assert.equal(visible(partner), "0");
  assert.throws(() => db.sql(as(actor, publish(lease))), /Busy capture superseded/);
});

test("newer capture generations reject out-of-order results", () => {
  const old = prepare();
  const newer = begin(old.consent);
  db.sql(as(actor, publish(newer, [{ start: 300, end: 400 }])));
  assert.throws(() => db.sql(as(actor, publish(old))), /Busy capture superseded/);
  assert.equal(
    db.sql(
      as(
        partner,
        `select intervals::text from public.nest_busy_snapshots where actor_id='${actor}'`,
      ),
    ),
    '[{"end": 400, "start": 300}]',
  );
});

test("a capture retry is immutable and cannot extend its expiry", () => {
  const lease = prepare();
  const expiry = db.sql(as(actor, publish(lease)));
  assert.equal(db.sql(as(actor, publish(lease))), expiry);
  assert.throws(
    () => db.sql(as(actor, publish(lease, [{ start: 100, end: 300 }]))),
    /Published capture changed/,
  );
});

test("snapshot validation rejects private metadata, overlapping/outside ranges and fractional bounds", () => {
  const lease = prepare();
  for (const intervals of [
    [{ start: 100, end: 200, title: "Private event" }],
    [{ start: 100, end: 200, calendarId: "Private calendar" }],
    [
      { start: 100, end: 200 },
      { start: 150, end: 250 },
    ],
    [{ start: 100, end: 1001 }],
    [{ start: 1.5, end: 20 }],
    [{ start: 100 }],
    null,
    [null],
  ]) {
    assert.throws(() => db.sql(as(actor, publish(lease, intervals))), /busy|Busy|interval/);
  }
  assert.equal(visible(partner), "0");
});

test("empty covered snapshots are allowed, but expired snapshots/captures are unavailable", () => {
  const lease = prepare();
  db.sql(as(actor, publish(lease, [])));
  assert.equal(visible(partner), "1");
  db.sql(`update public.nest_busy_snapshots set expires_at=now()-interval '1 second' where actor_id='${actor}';
    update public.nest_calendar_consent set capture_started_at=now()-interval '16 minutes' where actor_id='${actor}'`);
  assert.equal(visible(partner), "0");
  assert.throws(() => db.sql(as(actor, publish(lease, []))), /Busy capture expired/);
});

test("another member cannot publish using the owner capture lease", () => {
  const lease = prepare();
  assert.throws(() => db.sql(as(partner, publish(lease))), /Busy capture superseded/);
  assert.throws(() => db.sql(as(outsider, publish(lease))), /Not authorized/);
});

test("consent retries preserve revision and changed-payload reuse is rejected", () => {
  const operation = next(),
    expected = current();
  const sql = consent(expected, true, operation);
  const version = db.sql(as(actor, sql));
  db.sql(as(actor, publish(begin(version))));
  assert.equal(db.sql(as(actor, sql)), version);
  assert.equal(visible(partner), "1");
  assert.throws(
    () => db.sql(as(actor, consent(expected, false, operation))),
    /Consent operation changed/,
  );
});

test("publisher membership revocation removes consent and cannot revive sharing after rejoining", () => {
  const lease = prepare();
  db.sql(as(actor, publish(lease)));
  db.sql(`delete from public.household_members where user_id='${actor}'`);
  assert.equal(visible(partner), "0");
  assert.throws(() => db.sql(as(actor, publish(lease))), /Not authorized/);
  db.sql(
    `insert into public.household_members(household_id,user_id,display_name) values('${household}','${actor}','Restored')`,
  );
  assert.equal(visible(partner), "0");
  assert.equal(current(), "");
});

test("concurrent opt-out and publication cannot leave shared data visible", async () => {
  const lease = prepare();
  await Promise.allSettled([
    db.concurrent(as(actor, publish(lease))),
    db.concurrent(as(actor, consent(lease.consent, false))),
  ]);
  assert.equal(
    db.sql(`select enabled from public.nest_calendar_consent where actor_id='${actor}'`),
    "f",
  );
  assert.equal(visible(partner), "0");
});

test("failed snapshot replacement leaves the previous complete snapshot intact", () => {
  const first = prepare();
  db.sql(as(actor, publish(first)));
  const newer = begin(first.consent);
  db.sql(`create function private.fixture_busy_failure() returns trigger language plpgsql as $$
    begin raise exception 'Fixture snapshot failure'; end; $$;
    create trigger fail_busy before update on public.nest_busy_snapshots
    for each row execute function private.fixture_busy_failure()`);
  assert.throws(
    () => db.sql(as(actor, publish(newer, [{ start: 300, end: 400 }]))),
    /Fixture snapshot failure/,
  );
  assert.equal(
    db.sql(
      as(
        partner,
        `select intervals::text from public.nest_busy_snapshots where actor_id='${actor}'`,
      ),
    ),
    '[{"end": 200, "start": 100}]',
  );
  db.sql("drop trigger fail_busy on public.nest_busy_snapshots");
  db.sql(as(actor, publish(newer, [{ start: 300, end: 400 }])));
});

test("an empty database cannot partially install additive busy sharing", () => {
  const empty = startFixturePostgres();
  try {
    assert.throws(
      () => empty.file("supabase/migrations/20260919214955_native_busy_snapshots.sql"),
      /existing Household OS tenancy baseline/,
    );
    assert.equal(empty.sql("select to_regclass('public.nest_calendar_consent') is null"), "t");
  } finally {
    empty.stop();
  }
});
