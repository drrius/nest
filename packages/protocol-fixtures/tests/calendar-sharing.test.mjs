import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { calendarOperations } from "../src/calendar/operations.ts";
import { CalendarRuntime } from "../src/calendar/runtime.ts";
import { makeCalendarReader } from "../src/calendar/service.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = 1800000000000;
function setup(f) {
  let consent = { incarnation: id(1), version: "0", enabled: false },
    generation = 0,
    permission = true,
    missing = false,
    lost = false,
    requests = 0;
  const writes = [],
    publications = [];
  const client = {
    consent: () => Effect.succeed(consent),
    setConsent: (command) =>
      Effect.suspend(() => {
        writes.push(command);
        if (command.incarnation !== consent.incarnation)
          return Effect.fail(new PreferenceFailure({ code: "conflict" }));
        if (consent.version === command.expectedRevision)
          consent = {
            incarnation: command.incarnation,
            version: String(BigInt(consent.version) + 1n),
            enabled: command.enabled,
          };
        else if (consent.version !== String(BigInt(command.expectedRevision) + 1n))
          return Effect.fail(new PreferenceFailure({ code: "conflict" }));
        if (lost) {
          lost = false;
          return Effect.fail(new PreferenceFailure({ code: "unavailable" }));
        }
        return Effect.succeed(consent);
      }),
    begin: () =>
      Effect.succeed({
        incarnation: consent.incarnation,
        consent: consent.version,
        generation: String(++generation),
        capturedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 900000).toISOString(),
      }),
    publish: (input) =>
      Effect.sync(() => {
        publications.push(input);
        return { ...input, expiresAt: new Date(now + 900000).toISOString() };
      }),
  };
  const reader = makeReader(
    () => permission,
    () => missing,
    () => {
      requests++;
    },
  );
  const operations = calendarOperations(
    client,
    { store: f.store, session: f.session },
    reader,
    () => id(100 + writes.length),
  );
  const runtime = new CalendarRuntime(operations, () => now);
  return {
    runtime,
    operations,
    writes,
    publications,
    consent: () => consent,
    requests: () => requests,
    lose: () => {
      lost = true;
    },
    permission: (value) => {
      permission = value;
    },
    missing: () => {
      missing = true;
    },
    replace: () => {
      consent = { incarnation: id(2), version: "0", enabled: false };
    },
  };
}
test("calendar selection survives reopening, isolates accounts and blocks writes from a retired SQLite lease", async (t) => {
  const f = await fixture(t);
  const pending = {
    status: "pending",
    command: { incarnation: id(1), operationId: id(2), expectedRevision: "0", enabled: true },
    calendarIds: ["local-private-id"],
  };
  await run(f.store.saveCalendarSelection(f.session, pending));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readCalendarSelection(f.session)), pending);
  const partner = await run(reopened.store.activate({ ...account, actor: id(9) }, id(10)));
  assert.equal(await run(reopened.store.readCalendarSelection(partner)), null);
  await assert.rejects(run(reopened.store.saveCalendarSelection(f.session, null)), {
    reason: "session_changed",
  });
  const restored = await run(reopened.store.activate(account, lease));
  assert.deepEqual(await run(reopened.store.readCalendarSelection(restored)), pending);
  await assert.rejects(
    run(reopened.store.saveCalendarSelection(restored, { ...pending, title: "private metadata" })),
    { reason: "invalid_input" },
  );
});
test("calendar opt-in needs explicit selection, lost acknowledgment freezes writes and exact retry enables sanitized publication", async (t) => {
  const f = await fixture(t),
    s = setup(f);
  await s.runtime.load();
  assert.equal(s.requests(), 0);
  await s.runtime.refresh();
  assert.equal(s.publications.length, 0);
  s.lose();
  await s.runtime.change(["local-private-id"], true);
  assert.equal(s.runtime.getSnapshot().stage, "uncertain");
  await s.runtime.change([], false);
  await s.runtime.refresh();
  assert.equal(s.writes.length, 1);
  assert.equal(s.publications.length, 0);
  await s.runtime.retry();
  assert.deepEqual(s.writes[1], s.writes[0]);
  await s.runtime.refresh();
  assert.equal(s.publications.length, 1);
  assert.ok(!JSON.stringify(s.publications).includes("private"));
  assert.deepEqual(s.publications[0].intervals, [{ start: now + 100, end: now + 200 }]);
  assert.equal(s.runtime.getSnapshot().selection.status, "active");
});
test("a cold runtime exposes the durable uncertain opt-in without automatically granting it", async (t) => {
  const f = await fixture(t),
    s = setup(f);
  await s.runtime.load();
  s.lose();
  await s.runtime.change(["local-private-id"], true);
  s.runtime.dispose();
  const resumed = new CalendarRuntime(s.operations, () => now);
  await resumed.load();
  await resumed.refresh();
  assert.equal(resumed.getSnapshot().stage, "uncertain");
  assert.equal(s.writes.length, 1);
  assert.equal(s.publications.length, 0);
  await resumed.retry();
  await resumed.refresh();
  assert.equal(s.publications.length, 1);
});
test("revoked permission or a missing selected calendar disables sharing instead of publishing free time", async (t) => {
  for (const revoke of [(s) => s.permission(false), (s) => s.missing()]) {
    const f = await fixture(t),
      s = setup(f);
    await s.runtime.load();
    await s.runtime.change(["local-private-id"], true);
    revoke(s);
    await s.runtime.refresh();
    assert.equal(s.consent().enabled, false);
    assert.equal(s.publications.length, 0);
    assert.equal(await run(f.store.readCalendarSelection(f.session)), null);
  }
});
test("a failed automatic revocation remains durably pending and cannot republish on restart", async (t) => {
  const f = await fixture(t),
    s = setup(f);
  await s.runtime.load();
  await s.runtime.change(["local-private-id"], true);
  s.permission(false);
  s.lose();
  await s.runtime.refresh();
  assert.equal(s.runtime.getSnapshot().stage, "reload");
  await s.runtime.load();
  assert.equal(s.runtime.getSnapshot().selection.command.enabled, false);
  await s.runtime.refresh();
  assert.equal(s.publications.length, 0);
  await s.runtime.retry();
  assert.equal(await run(f.store.readCalendarSelection(f.session)), null);
});
test("membership replacement clears an obsolete pending request without re-enabling sharing", async (t) => {
  const f = await fixture(t),
    s = setup(f);
  await s.runtime.load();
  s.lose();
  await s.runtime.change(["local-private-id"], true);
  s.replace();
  await s.runtime.retry();
  assert.equal(s.runtime.getSnapshot().stage, "ready");
  assert.equal(s.runtime.getSnapshot().consent.enabled, false);
  assert.equal(s.runtime.getSnapshot().selection, null);
  await s.runtime.refresh();
  assert.equal(s.publications.length, 0);
});
test("disposed calendar runtime cannot restore account state or dispatch later changes", async (t) => {
  const f = await fixture(t),
    s = setup(f);
  await s.runtime.load();
  s.runtime.dispose();
  await s.runtime.change(["local-private-id"], true);
  await s.runtime.load();
  await s.runtime.refresh();
  assert.equal(s.writes.length, 0);
  assert.equal(s.runtime.getSnapshot().consent, null);
});

function makeReader(permission, missing, requested) {
  return makeCalendarReader({
    permission: async () => permission(),
    requestPermission: async () => {
      requested();
      return permission();
    },
    calendars: async () => (missing() ? [] : [{ id: "local-private-id", title: "Private name" }]),
    events: async () => [
      {
        calendarId: "local-private-id",
        startDate: new Date(now + 100),
        endDate: new Date(now + 200),
        availability: "busy",
        status: "confirmed",
        title: "Secret title",
      },
    ],
  });
}

test("a delayed calendar load cannot restore titles or selection after disposal", async () => {
  let complete;
  const waiting = new Promise((resolve) => {
    complete = resolve;
  });
  const runtime = new CalendarRuntime({ load: () => Effect.promise(() => waiting) }, () => now);
  const load = runtime.load();
  runtime.dispose();
  complete({
    consent: { incarnation: id(1), version: "1", enabled: true },
    selection: null,
    local: { status: "ready", calendars: [{ id: "private", title: "Private title" }] },
  });
  await load;
  assert.equal(runtime.getSnapshot().consent, null);
  assert.deepEqual(runtime.getSnapshot().calendars, []);
});
