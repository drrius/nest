import assert from "node:assert/strict";
import test from "node:test";
import { reminderDraft, parseReminderDraft } from "../src/grocery-reminders/form.ts";
import { reminderConfirmation } from "../src/grocery-reminders/confirmation.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = {
  actorId: id(1),
  householdId: id(10),
  itemVersion: "1",
  grocery: {
    itemId: id(100),
    name: "Milk",
    date: "2026-09-25",
    slot: "dinner",
    recipeUrl: null,
    notes: null,
    definitionId: null,
    leftoverSourceId: null,
  },
  reminder: null,
  members: [
    { actorId: id(1), displayName: "A" },
    { actorId: id(2), displayName: "B" },
  ],
};
const command = {
  operationId: id(200),
  itemId: id(100),
  expectedItemVersion: context.itemVersion,
  expectedRevision: null,
  settings: { enabled: true, recipientIds: [id(2)], localTime: "09:00", localDate: "2026-09-24" },
};
test("grocery reminder drafts reject malformed timing and enabled reminders without recipients", () => {
  const initial = reminderDraft(null);
  assert.equal(initial.enabled, false);
  for (const patch of [
    { localDate: "2026-02-29" },
    { localDate: "2026-09-24\n" },
    { localDate: "0000-01-01" },
    { localTime: "24:00" },
    { enabled: true },
  ])
    assert.equal(parseReminderDraft({ ...initial, ...patch }), null);
  assert.deepEqual(parseReminderDraft(command.settings), command.settings);
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
  assert.match(dialog.message, /this grocery item only/);
  current = false;
  assert.equal(await dialog.confirm(), false);
  current = true;
  assert.equal(await dialog.confirm(), true);
  assert.equal(await dialog.confirm(), false);
  assert.equal(saves, 1);
  for (const changed of [
    { ...context, itemVersion: "2" },
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
