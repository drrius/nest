import assert from "node:assert/strict";
import test from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const choice = { calendarIds: ["local-personal", "local-shared"] };

test("agenda selection survives real SQLite restart without granting or changing busy sharing", async (t) => {
  const f = await fixture(t);
  assert.equal(await run(f.store.readAgendaSelection(f.session)), null);
  await run(f.store.saveAgendaSelection(f.session, choice));
  assert.equal(await run(f.store.readCalendarSelection(f.session)), null);
  const sharing = {
    status: "active",
    calendarIds: ["local-work"],
    consent: { incarnation: id(1), version: "1", enabled: true },
  };
  await run(f.store.saveCalendarSelection(f.session, sharing));
  assert.deepEqual(await run(f.store.readAgendaSelection(f.session)), choice);
  const reopened = f.reopen();
  await run(reopened.store.initialize);
  const session = await run(reopened.store.activate(account, id(2)));
  assert.deepEqual(await run(reopened.store.readAgendaSelection(session)), choice);
  await run(reopened.store.saveAgendaSelection(session, { calendarIds: [] }));
  assert.deepEqual(await run(reopened.store.readAgendaSelection(session)), { calendarIds: [] });
  assert.deepEqual(await run(reopened.store.readCalendarSelection(session)), sharing);
  await run(reopened.store.saveAgendaSelection(session, null));
  assert.equal(await run(reopened.store.readAgendaSelection(session)), null);
  assert.deepEqual(await run(reopened.store.readCalendarSelection(session)), sharing);
});

test("account and household leases isolate displayed calendars and reject stale reads/writes", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveAgendaSelection(f.session, choice));
  const partner = await run(f.store.activate({ ...account, actor: id(3) }, id(4)));
  assert.equal(await run(f.store.readAgendaSelection(partner)), null);
  await assert.rejects(
    run(f.store.readAgendaSelection(f.session)),
    (e) => e.reason === "session_changed",
  );
  await assert.rejects(
    run(f.store.saveAgendaSelection(f.session, null)),
    (e) => e.reason === "session_changed",
  );
  await run(f.store.saveAgendaSelection(partner, { calendarIds: ["partner-local"] }));
  const anotherHome = await run(f.store.activate({ ...account, household: id(5) }, id(6)));
  assert.equal(await run(f.store.readAgendaSelection(anotherHome)), null);
  const original = await run(f.store.activate(account, lease));
  assert.deepEqual(await run(f.store.readAgendaSelection(original)), choice);
  await run(f.store.suspend(original));
  await assert.rejects(
    run(f.store.readAgendaSelection(original)),
    (e) => e.reason === "session_changed",
  );
});

test("selection stores only validated local IDs and failed persistence preserves the previous choice", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveAgendaSelection(f.session, choice));
  for (const invalid of [
    { ...choice, title: "Private calendar" },
    { calendarIds: ["duplicate", "duplicate"] },
    { calendarIds: [""] },
    { calendarIds: Array.from({ length: 257 }, (_, i) => `calendar-${i}`) },
    { calendarIds: ["x".repeat(1025)] },
    { ...choice, consent: true },
  ]) {
    await assert.rejects(
      run(f.store.saveAgendaSelection(f.session, invalid)),
      (e) => e.reason === "invalid_input",
    );
  }
  assert.deepEqual(await run(f.store.readAgendaSelection(f.session)), choice);
  const stored = f.connection.prepare("select data from agenda_selection").get();
  assert.deepEqual(JSON.parse(stored.data), choice);
  f.connection.exec(
    "create trigger fail_agenda_save before update on agenda_selection begin select raise(abort,'fixture storage failure'); end;",
  );
  await assert.rejects(
    run(f.store.saveAgendaSelection(f.session, { calendarIds: [] })),
    (e) => e.reason === "storage",
  );
  assert.deepEqual(await run(f.store.readAgendaSelection(f.session)), choice);
  f.connection.exec("drop trigger fail_agenda_save;");
  f.connection
    .prepare("update agenda_selection set data=?")
    .run(JSON.stringify({ ...choice, notes: "Private event" }));
  await assert.rejects(run(f.store.readAgendaSelection(f.session)), (e) => e.reason === "storage");
});
