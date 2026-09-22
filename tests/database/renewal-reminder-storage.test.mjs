import test from "node:test";
import { createRequire } from "node:module";
import {
  RenewalReminderReceipt,
  RenewalReminderRecovery,
  RenewalReminderEnvelope,
} from "../../packages/contracts/src/reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
import assert from "node:assert/strict";
import { fixture, id, as, json } from "./renewal-fixture.mjs";
const settings = { enabled: true, recipientIds: [id(2), id(1)], localTime: "08:30", daysBefore: 7 };
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922213246_native_renewal_reminder_storage.sql");
  return f;
}
test("reminder storage canonicalizes recipients and refuses mute authority and malformed timing", (t) => {
  const f = setup(t);
  const parse = (value) =>
    JSON.parse(f.db.sql(`select private.nest_reminder_settings(${json(value)})`));
  assert.deepEqual(parse(settings), { ...settings, recipientIds: [id(1), id(2)] });
  for (const value of [
    { ...settings, recipientIds: [] },
    { ...settings, recipientIds: [id(1), id(1)] },
    { ...settings, localTime: "08:30\n" },
    { ...settings, localTime: "24:00" },
    { ...settings, daysBefore: 731 },
    { ...settings, daysBefore: 1.5 },
    { ...settings, overrideMute: true },
    { ...settings, recipientIds: [null] },
  ])
    assert.throws(() => parse(value));
  assert.deepEqual(parse({ ...settings, enabled: false, recipientIds: [] }).recipientIds, []);
});
test("reminder rows are household isolated and client writes and private receipts are inaccessible", (t) => {
  const f = setup(t),
    saved = f.record(f.save());
  f.db.sql(
    `insert into public.nest_renewal_reminders values('${id(10)}','${id(900)}','${id(950)}','${saved.renewal.revision}','${id(1)}','renewal',private.nest_reminder_settings(${json(settings)}))`,
  );
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_renewal_reminders")), "1");
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_renewal_reminders")), "0");
  for (const query of [
    "update public.nest_renewal_reminders set anchor='cancellation'",
    "delete from public.nest_renewal_reminders",
    "select * from private.nest_renewal_reminder_operations",
  ])
    assert.throws(() => f.db.sql(as(1, query)), /permission denied/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from public.nest_renewal_reminders`),
      /permission denied/,
    );
});
function commands(t) {
  const f = setup(t),
    renewal = f.record(f.save()).renewal;
  const input = {
    renewalId: renewal.renewalId,
    expectedRenewalRevision: renewal.revision,
    expectedRevision: null,
    settings: { anchor: "cancellation", delivery: settings },
  };
  const save = (value = input, op = 960) =>
    `select public.nest_save_renewal_reminder('${id(10)}','${id(op)}',${json(value)})`;
  const recover = (cancel = false, op = 960) =>
    `select public.nest_${cancel ? "cancel" : "read"}_renewal_reminder_operation('${id(10)}','${id(op)}')`;
  return { ...f, renewal, input, saveReminder: save, recover };
}
test("concurrent reminder retries record one immutable result; both revisions protect edits", async (t) => {
  const f = commands(t);
  const receipts = (
    await Promise.all(Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.saveReminder()))))
  ).map((r) => JSON.parse(r.stdout));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  const first = receipts[0];
  assert.equal(Schema.is(RenewalReminderReceipt)(first), true);
  assert.deepEqual(first.command.settings.delivery.recipientIds, [id(1), id(2)]);
  assert.equal(first.reminder.reviewedRenewalRevision, f.renewal.revision);
  const updated = f.record(
    f.saveReminder(
      {
        ...f.input,
        expectedRevision: first.reminder.revision,
        settings: { ...f.input.settings, delivery: { ...settings, enabled: false } },
      },
      961,
    ),
    2,
  );
  assert.notEqual(updated.reminder.revision, first.reminder.revision);
  assert.throws(() => f.record(f.saveReminder(f.input, 962)), /Reminder changed/);
  f.record(
    f.save(
      {
        renewalId: id(900),
        expectedRevision: f.renewal.revision,
        fields: { ...f.fields, title: "Updated" },
      },
      963,
    ),
  );
  assert.throws(
    () =>
      f.record(f.saveReminder({ ...f.input, expectedRevision: updated.reminder.revision }, 964)),
    /Renewal changed/,
  );
  assert.deepEqual(f.record(f.saveReminder()), first);
  assert.deepEqual(f.record(f.recover(true)).receipt, first);
  assert.equal(Schema.is(RenewalReminderRecovery)(f.record(f.recover())), true);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("reminder cancellation fences late sends; foreign recipients and callers cannot mutate", (t) => {
  const f = commands(t);
  assert.equal(f.record(f.recover()).status, "unresolved");
  assert.equal(f.record(f.recover(true)).status, "cancelled");
  assert.throws(() => f.record(f.saveReminder()), /abandoned/);
  assert.throws(() => f.record(f.saveReminder(f.input, 961), 3), /Not authorized/);
  assert.throws(
    () =>
      f.record(
        f.saveReminder(
          {
            ...f.input,
            settings: { ...f.input.settings, delivery: { ...settings, recipientIds: [id(3)] } },
          },
          962,
        ),
      ),
    /recipient unavailable/,
  );
  assert.equal(f.record(f.recover(false, 962)).status, "unresolved");
  assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "0");
  assert.throws(() => f.record(f.recover(false), 3), /Not authorized/);
});
test("receipt persistence failure rolls back settings; read preserves absence and known settings", (t) => {
  const f = commands(t);
  const read = `select public.nest_read_renewal_reminder('${id(10)}','${id(900)}')`;
  assert.equal(f.record(read).reminder, null);
  assert.equal(Schema.is(RenewalReminderEnvelope)(f.record(read)), true);
  f.db.sql(
    "alter table private.nest_renewal_reminder_operations add constraint fail_receipt check(false)",
  );
  assert.throws(() => f.record(f.saveReminder()), /fail_receipt/);
  assert.equal(f.record(read).reminder, null);
  f.db.sql("alter table private.nest_renewal_reminder_operations drop constraint fail_receipt");
  const saved = f.record(f.saveReminder());
  assert.deepEqual(f.record(read, 2).reminder, saved.reminder);
  assert.throws(() => f.record(read, 3), /Not authorized/);
  f.record(f.remove(f.renewal.revision));
  assert.deepEqual(f.record(read).reminder, saved.reminder);
  assert.throws(
    () => f.record(f.saveReminder({ ...f.input, expectedRevision: saved.reminder.revision }, 961)),
    /Renewal changed/,
  );
});
test("reminders reject date underflow and changed operation intent", (t) => {
  const f = commands(t);
  const changed = f.record(
    f.save(
      {
        renewalId: id(900),
        expectedRevision: f.renewal.revision,
        fields: { ...f.fields, renewalOn: "0001-01-02", noticeDays: 1 },
      },
      970,
    ),
  );
  const input = { ...f.input, expectedRenewalRevision: changed.renewal.revision };
  assert.throws(() => f.record(f.saveReminder(input)), /Unsupported reminder date/);
  const valid = {
    ...input,
    settings: { ...input.settings, delivery: { ...settings, daysBefore: 0 } },
  };
  const saved = f.record(f.saveReminder(valid));
  assert.throws(
    () =>
      f.record(f.saveReminder({ ...valid, settings: { ...valid.settings, anchor: "renewal" } })),
    /operation changed/,
  );
  assert.deepEqual(f.record(f.saveReminder(valid)), saved);
});
test("racing cancellation and save agree on a single terminal outcome", async (t) => {
  const f = commands(t);
  const outcomes = await Promise.allSettled([
    f.db.concurrent(as(1, f.saveReminder())),
    f.db.concurrent(as(1, f.recover(true))),
  ]);
  assert.equal(outcomes[1].status, "fulfilled");
  const terminal = f.record(f.recover());
  assert.equal(Schema.is(RenewalReminderRecovery)(terminal), true);
  if (terminal.status === "recorded") {
    assert.equal(outcomes[0].status, "fulfilled");
    assert.deepEqual(JSON.parse(outcomes[0].value.stdout), terminal.receipt);
  } else {
    assert.equal(terminal.status, "cancelled");
    assert.equal(outcomes[0].status, "rejected");
    assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "0");
  }
});
