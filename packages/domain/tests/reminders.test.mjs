import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { reminderRecipients, reminderIdentity, reminderIsCurrent } from "../src/reminders.ts";
test("recipient preferences override selections and personal reminders cannot reach a partner", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom("me", "partner", "both"),
      (a, b, choice) => {
        const members = [
          { id: "a", itemRemindersEnabled: a },
          { id: "b", itemRemindersEnabled: b },
        ];
        const result = reminderRecipients("a", choice, members);
        assert.equal(result.includes("a"), a && choice !== "partner");
        assert.equal(result.includes("b"), b && choice !== "me");
        assert.equal(reminderRecipients("a", choice, members, "a").includes("b"), false);
        assert.deepEqual(reminderRecipients("a", choice, members, "b"), []);
        assert.deepEqual(reminderRecipients("outsider", choice, members), []);
      },
    ),
  );
});
test("reminder identity is stable and separates every delivery dimension without delimiter collisions", () => {
  fc.assert(
    fc.property(fc.array(fc.string(), { minLength: 6, maxLength: 6 }), (values) => {
      const keys = [
        "householdId",
        "recipientId",
        "itemKind",
        "itemId",
        "scheduleRevision",
        "occurrence",
      ];
      const value = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
      const identity = reminderIdentity(value);
      assert.deepEqual(JSON.parse(identity), values);
      for (const key of keys)
        assert.notEqual(reminderIdentity({ ...value, [key]: value[key] + "x" }), identity);
    }),
    { numRuns: 1000 },
  );
});
test("completion, mute and revision changes invalidate pending reminders", () => {
  const scheduled = { itemRevision: "1", scheduleRevision: "2" };
  const current = { ...scheduled, active: true, recipientEnabled: true };
  assert.equal(reminderIsCurrent(scheduled, current), true);
  for (const patch of [
    { active: false },
    { recipientEnabled: false },
    { itemRevision: "3" },
    { scheduleRevision: "4" },
  ]) {
    assert.equal(reminderIsCurrent(scheduled, { ...current, ...patch }), false);
  }
});
test("invalid rosters cannot produce reminder recipients", () => {
  for (const members of [
    [],
    [{ id: "a", itemRemindersEnabled: true }],
    [
      { id: "a", itemRemindersEnabled: true },
      { id: "a", itemRemindersEnabled: true },
    ],
  ]) {
    assert.deepEqual(reminderRecipients("a", "both", members), []);
  }
});
