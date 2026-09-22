import test from "node:test";
import assert from "node:assert/strict";
import { reminderDraft, parseReminderDraft } from "../src/renewal-reminders/form.ts";
const member = "00000000-0000-4000-8000-000000000001";
test("reminder form requires explicit recipients and rejects malformed timing without coercion", () => {
  const initial = reminderDraft(null);
  assert.equal(initial.enabled, false);
  assert.deepEqual(initial.recipientIds, []);
  assert.ok(parseReminderDraft(initial));
  assert.equal(parseReminderDraft({ ...initial, enabled: true }), null);
  const enabled = { ...initial, enabled: true, recipientIds: [member] };
  for (const daysBefore of ["", " 1", "1\n", "1.5", "-1", "731", "01"])
    assert.equal(parseReminderDraft({ ...enabled, daysBefore }), null);
  for (const localTime of ["9:00", "24:00", "09:00\n"])
    assert.equal(parseReminderDraft({ ...enabled, localTime }), null);
  assert.equal(parseReminderDraft({ ...enabled, daysBefore: "730" }).delivery.daysBefore, 730);
});
test("editing retained reminder settings preserves anchor and recipients without aliasing", () => {
  const reminder = {
    settings: {
      anchor: "cancellation",
      delivery: { enabled: true, recipientIds: [member], localTime: "07:45", daysBefore: 14 },
    },
  };
  const draft = reminderDraft(reminder);
  assert.deepEqual(parseReminderDraft(draft), reminder.settings);
  draft.recipientIds.push("00000000-0000-4000-8000-000000000002");
  assert.deepEqual(reminder.settings.delivery.recipientIds, [member]);
});
test("reminder confirmation binds both revisions, recipients and timing with one-use current checks", async () => {
  const { reminderConfirmation } = await import("../src/renewal-reminders/confirmation.ts");
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const context = {
    renewal: {
      renewalId: id(9),
      revision: id(10),
      removed: false,
      cancellationOn: "2028-02-29",
      fields: { title: "Internet", renewalOn: "2028-03-01" },
    },
    reminder: null,
    members: [{ actorId: member, displayName: "Alex" }],
  };
  const command = {
    operationId: id(11),
    renewalId: id(9),
    expectedRenewalRevision: id(10),
    expectedRevision: null,
    settings: {
      anchor: "cancellation",
      delivery: { enabled: true, recipientIds: [member], localTime: "08:30", daysBefore: 1 },
    },
  };
  const calls = [],
    confirm = reminderConfirmation(
      command,
      context,
      () => true,
      async (value) => {
        calls.push(value);
      },
    );
  assert.match(confirm.message, /Alex/);
  assert.match(confirm.message, /2028-02-28 at 08:30/);
  command.settings.delivery.localTime = "10:00";
  assert.equal(await confirm.confirm(), true);
  assert.equal(await confirm.confirm(), false);
  assert.equal(calls[0].settings.delivery.localTime, "08:30");
  assert.equal(
    reminderConfirmation(
      { ...command, expectedRevision: id(12) },
      context,
      () => true,
      async () => {},
    ),
    null,
  );
  assert.equal(
    reminderConfirmation(
      command,
      { ...context, members: [] },
      () => true,
      async () => {},
    ),
    null,
  );
  const stale = reminderConfirmation(
    command,
    context,
    () => false,
    async () => assert.fail("stale save"),
  );
  assert.equal(await stale.confirm(), false);
});
test("recovery gates a different renewal and presents the original settings with authorized labels", async () => {
  const { reminderRecoveryReview } = await import("../src/renewal-reminders/recovery-review.ts");
  const command = {
    renewalId: member,
    settings: {
      anchor: "cancellation",
      delivery: { enabled: true, recipientIds: [member], localTime: "08:30", daysBefore: 7 },
    },
  };
  const context = {
    renewal: { renewalId: member, fields: { title: "Internet" } },
    members: [{ actorId: member, displayName: "Alex" }],
  };
  assert.deepEqual(reminderRecoveryReview(command, "another", context), {
    target: member,
    summary: null,
  });
  const own = reminderRecoveryReview(command, member, context);
  assert.equal(own.target, null);
  for (const text of [
    "Internet",
    "Alex",
    "On",
    "7 days before cancellation deadline",
    "08:30",
    "original pending settings",
  ])
    assert.ok(own.summary.includes(text));
  assert.match(reminderRecoveryReview(command, member, null).summary, /Member 00000000/);
});
