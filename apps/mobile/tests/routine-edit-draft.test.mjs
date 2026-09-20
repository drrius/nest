import assert from "node:assert/strict";
import { test } from "node:test";
import { routineEditPatch, scheduleDraft } from "../src/routines/edit-draft.ts";
const base = { title: "Clean", schedule: { kind: "daily" }, assignment: { policy: "shared" } };
const today = "2026-09-20";
test("every supported recurrence reopens without creating a spurious edit", () => {
  for (const schedule of [
    { kind: "daily" },
    { kind: "one_off", date: "0004-02-29" },
    { kind: "weekdays", days: [7, 1, 3] },
    { kind: "weekly", weekday: 2 },
    { kind: "biweekly", weekday: 3 },
    { kind: "monthly", dayOfMonth: 31 },
    { kind: "after_completion", every: 2147483647, unit: "days" },
  ]) {
    const original = { ...base, schedule };
    assert.deepEqual(
      routineEditPatch(original, base.title, scheduleDraft(schedule, today), base.assignment),
      { status: "unchanged" },
    );
  }
});
test("schedule-only editing retains historical titles verbatim and rejects newly invalid titles", () => {
  const original = { ...base, title: " " + "🧹".repeat(118) + " " };
  const draft = scheduleDraft({ kind: "monthly", dayOfMonth: 31 }, today);
  assert.deepEqual(routineEditPatch(original, original.title, draft, base.assignment), {
    status: "changed",
    patch: { schedule: { kind: "monthly", dayOfMonth: 31 } },
  });
  assert.equal(
    routineEditPatch(original, "x".repeat(121), draft, base.assignment).status,
    "invalid",
  );
  assert.equal(routineEditPatch(original, "   ", draft, base.assignment).status, "invalid");
});
test("editing title only never resubmits recurrence or responsibility", () => {
  const draft = scheduleDraft(base.schedule, today);
  assert.deepEqual(routineEditPatch(base, "  Sweep  ", draft, base.assignment), {
    status: "changed",
    patch: { title: "Sweep" },
  });
  const every = scheduleDraft({ kind: "after_completion", every: 2, unit: "days" }, today);
  assert.equal(
    routineEditPatch(base, base.title, { ...every, every: "2.5" }, base.assignment).status,
    "invalid",
  );
});
