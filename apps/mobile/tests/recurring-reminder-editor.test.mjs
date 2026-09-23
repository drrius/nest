import assert from "node:assert/strict";
import test from "node:test";
import { reminderDraft, parseReminderDraft } from "../src/recurring-reminders/form.ts";
import { reminderConfirmation } from "../src/recurring-reminders/confirmation.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  actorId: id(1),
  householdId: id(10),
  rule: {
    ruleId: id(100),
    revision: id(400),
    status: "active",
    nextDueOn: "2026-09-25",
    configuration: { description: "Electricity" },
  },
  reminder: null,
  members: [
    { actorId: id(1), displayName: "A" },
    { actorId: id(2), displayName: "B" },
  ],
};
const command = {
  operationId: id(200),
  ruleId: id(100),
  expectedRuleRevision: context.rule.revision,
  expectedDueOn: context.rule.nextDueOn,
  expectedRevision: null,
  settings: { enabled: true, recipientIds: [id(2)], localTime: "09:00", daysBefore: 1 },
};
test("recurring reminder drafts reject malformed timing and enabled reminders without recipients", () => {
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
  assert.match(dialog.message, /not the financial rule or ledger/);
  current = false;
  assert.equal(await dialog.confirm(), false);
  current = true;
  assert.equal(await dialog.confirm(), true);
  assert.equal(await dialog.confirm(), false);
  assert.equal(saves, 1);
  for (const changed of [
    { ...context, rule: { ...context.rule, revision: id(401) } },
    { ...context, rule: { ...context.rule, status: "paused" } },
    { ...context, rule: { ...context.rule, nextDueOn: "2026-10-25" } },
    { ...context, members: [] },
    { ...context, reminder: { revision: id(300) } },
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
