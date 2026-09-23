import assert from "node:assert/strict";
import test from "node:test";
import { reminderDraft, parseReminderDraft } from "../src/chore-reminders/form.ts";
import { reminderConfirmation } from "../src/chore-reminders/confirmation.ts";
import { reminderRecoveryReview } from "../src/chore-reminders/recovery-review.ts";
import { reminderNeedsVerification } from "../src/chore-reminders/editor-access.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  actorId: id(1),
  householdId: id(10),
  itemRevision: "a".repeat(64),
  chore: {
    occurrenceId: id(100),
    title: "Clean kitchen",
    dueDate: "2026-09-25",
    assigneeId: id(1),
  },
  reminder: null,
  members: [
    { actorId: id(1), displayName: "A" },
    { actorId: id(2), displayName: "B" },
  ],
};
const command = {
  operationId: id(200),
  occurrenceId: id(100),
  expectedItemRevision: context.itemRevision,
  expectedRevision: null,
  settings: { enabled: true, recipientIds: [id(2)], localTime: "09:00", daysBefore: 1 },
};
test("chore reminder drafts reject malformed timing and enabled reminders without recipients", () => {
  const initial = reminderDraft(null);
  assert.equal(initial.enabled, false);
  for (const patch of [
    { daysBefore: "1.5" },
    { daysBefore: "01" },
    { daysBefore: "731" },
    { localTime: "24:00" },
    { enabled: true },
  ])
    assert.equal(parseReminderDraft({ ...initial, ...patch }), null);
  assert.deepEqual(parseReminderDraft({ ...command.settings, daysBefore: "1" }), command.settings);
});
test("confirmation captures the reviewed item/recipients and rejects stale, repeated or invalidated decisions", async () => {
  let current = true,
    saves = 0;
  const dialog = reminderConfirmation(
    command,
    context,
    () => current,
    async (saved) => {
      assert.deepEqual(saved, command);
      saves++;
    },
  );
  assert.match(dialog.message, /2026-09-24 at 09:00/);
  assert.match(dialog.message, /this occurrence only/);
  current = false;
  assert.equal(await dialog.confirm(), false);
  current = true;
  assert.equal(await dialog.confirm(), true);
  assert.equal(await dialog.confirm(), false);
  assert.equal(saves, 1);
  for (const changed of [
    { ...context, itemRevision: "b".repeat(64) },
    { ...context, members: [] },
    { ...context, reminder: { revision: id(300) } },
    { ...context, chore: { ...context.chore, dueDate: "0001-01-01" } },
  ])
    assert.equal(
      reminderConfirmation(
        command,
        changed,
        () => true,
        async () => {},
      ),
      null,
    );
});
test("missing chore context preserves separately authorized recovery but access failure hides it", () => {
  assert.equal(
    reminderNeedsVerification(
      { verify: false, attempt: { command }, result: null },
      { verify: true },
    ),
    false,
  );
  assert.equal(
    reminderNeedsVerification(
      { verify: true, attempt: { command }, result: null },
      { verify: false },
    ),
    true,
  );
  assert.equal(
    reminderNeedsVerification({ verify: false, attempt: null, result: null }, { verify: true }),
    true,
  );
  const review = reminderRecoveryReview(command, id(100), null);
  assert.match(review.summary, /original pending settings/);
  assert.equal(reminderRecoveryReview(command, id(101), context).target, id(100));
});
