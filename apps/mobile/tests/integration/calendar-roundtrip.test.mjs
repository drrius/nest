import { PartnerRuntime } from "../../src/calendar/partner-runtime.ts";
import { partnerOperations } from "../../src/calendar/partner-operations.ts";
import { partnerAgenda } from "../../src/calendar/partner-agenda.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { fixture, run } from "../offline-fixture.mjs";
import { calendarClient } from "../../src/calendar/client.ts";
import { calendarOperations } from "../../src/calendar/operations.ts";
import { CalendarRuntime } from "../../src/calendar/runtime.ts";
import { makeCalendarReader } from "../../src/calendar/service.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/busy-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260919214955_native_busy_snapshots.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/`;
  const connect = (address = url, actor = id(1), bearer = remote.bearer) =>
    calendarClient(
      address,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
async function native(t, client, start = 100) {
  const f = await fixture(t);
  const session = await run(f.store.activate({ actor: id(1), household: id(10) }, id(start)));
  let permission = true,
    sequence = start + 1;
  const reader = makeCalendarReader({
    permission: async () => permission,
    requestPermission: async () => permission,
    calendars: async () => [{ id: "device-only", title: "Private work calendar" }],
    events: async () => {
      const now = Date.now();
      return [
        {
          calendarId: "device-only",
          startDate: new Date(now + 1000),
          endDate: new Date(now + 2000),
          availability: "busy",
          status: "confirmed",
          title: "Private appointment",
        },
      ];
    },
  });
  const operations = calendarOperations(client, { store: f.store, session }, reader, () =>
    id(sequence++),
  );
  const runtime = new CalendarRuntime(operations, Date.now);
  t.after(() => runtime.dispose());
  return {
    runtime,
    operations,
    deny: () => {
      permission = false;
    },
    record: () => run(f.store.readCalendarSelection(session)),
  };
}
test("native sharing recovers a lost opt-in response after a cold restart, publishes only intervals, then removes them after permission revocation", async (t) => {
  const { remote, url, connect } = await backend(t),
    proxy = await lostResponseProxy(t, url, "/v1/calendar/consent/set");
  const first = await native(t, connect(proxy.url));
  await first.runtime.load();
  await first.runtime.change(["device-only"], true);
  assert.equal(first.runtime.getSnapshot().stage, "uncertain");
  assert.equal(proxy.dropped(), 1);
  first.runtime.dispose();
  const reopened = new CalendarRuntime(first.operations, Date.now);
  t.after(() => reopened.dispose());
  await reopened.load();
  await reopened.refresh();
  assert.equal(remote.db.sql("select count(*) from public.nest_busy_snapshots"), "0");
  await reopened.retry();
  await reopened.refresh();
  const partner = connect(url, id(2), remote.partnerBearer);
  const rows = await run(partner.snapshots());
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes("Private"));
  assert.ok(!JSON.stringify(rows).includes("device-only"));
  first.deny();
  await reopened.refresh();
  assert.equal(reopened.getSnapshot().consent.enabled, false);
  assert.deepEqual(await run(partner.snapshots()), []);
  assert.equal(await first.record(), null);
});
test("another device's opt-out invalidates local selection and old pending opt-in cannot override it", async (t) => {
  const { url, connect } = await backend(t),
    proxy = await lostResponseProxy(t, url, "/v1/calendar/consent/set");
  const first = await native(t, connect(proxy.url));
  await first.runtime.load();
  await first.runtime.change(["device-only"], true);
  const other = connect(),
    consent = await run(other.consent());
  await run(
    other.setConsent({
      incarnation: consent.incarnation,
      operationId: id(500),
      expectedRevision: consent.version,
      enabled: false,
    }),
  );
  await first.runtime.retry();
  assert.equal(first.runtime.getSnapshot().stage, "ready");
  assert.equal(first.runtime.getSnapshot().selection, null);
  assert.equal(first.runtime.getSnapshot().consent.enabled, false);
  await first.runtime.refresh();
  assert.deepEqual(await run(other.snapshots()), []);
});
test("a publication acknowledgment lost after commit can refresh safely but cannot revive snapshots after account revocation", async (t) => {
  const { remote, url, connect } = await backend(t),
    proxy = await lostResponseProxy(t, url, "/v1/calendar/publish");
  const first = await native(t, connect(proxy.url));
  await first.runtime.load();
  await first.runtime.change(["device-only"], true);
  await first.runtime.refresh();
  assert.equal(proxy.dropped(), 1);
  assert.equal(first.runtime.getSnapshot().stage, "reload");
  assert.equal(remote.db.sql("select count(*) from public.nest_busy_snapshots"), "1");
  await first.runtime.load();
  await first.runtime.refresh();
  assert.equal(first.runtime.getSnapshot().stage, "ready");
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await first.runtime.refresh();
  assert.equal(first.runtime.getSnapshot().stage, "verify");
  assert.deepEqual(first.runtime.getSnapshot().calendars, []);
  assert.equal(first.runtime.getSnapshot().selection, null);
  assert.equal(remote.db.sql("select count(*) from public.nest_busy_snapshots"), "0");
});

test("native partner agenda recovers a lost read, shows only fresh partial coverage and removes opt-out/revoked evidence", async (t) => {
  const { remote, url, connect } = await backend(t);
  const publisher = await native(t, connect());
  await publisher.runtime.load();
  await publisher.runtime.change(["device-only"], true);
  await publisher.runtime.refresh();
  const proxy = await lostResponseProxy(t, url, "/v1/calendar/busy");
  const local = await fixture(t);
  const session = await run(local.store.activate({ actor: id(2), household: id(10) }, id(800)));
  const reader = new PartnerRuntime(
    partnerOperations(
      { store: local.store, session },
      connect(proxy.url, id(2), remote.partnerBearer),
    ),
    Date.now,
  );
  t.after(() => reader.dispose());
  await reader.setActive(true);
  assert.equal(proxy.dropped(), 1);
  assert.equal(reader.getSnapshot().snapshots, null);
  assert.equal(reader.getSnapshot().access, true);
  await reader.refresh();
  const snapshots = reader.getSnapshot().snapshots;
  assert.equal(snapshots.length, 1);
  const source = snapshots[0];
  const window = { start: source.covered.start - 1, end: source.covered.start + 60000 };
  const result = partnerAgenda(snapshots, id(2), window, reader.getSnapshot().asOf);
  assert.equal(result.status, "known");
  assert.equal(result.complete, false);
  assert.equal(result.intervals.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /Private|device-only|actorId|calendarId/);
  await publisher.runtime.change([], false);
  await reader.refresh();
  assert.deepEqual(partnerAgenda(reader.getSnapshot().snapshots, id(2), window, Date.now()), {
    status: "unknown",
  });
  remote.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  await reader.refresh();
  assert.equal(reader.getSnapshot().access, false);
  assert.equal(reader.getSnapshot().snapshots, null);
});
