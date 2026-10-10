import assert from "node:assert/strict";
import { test } from "node:test";
import { initialSchedule, parseRoutineDraft, scheduleLabel } from "../src/routines/draft.ts";
const member = "00000000-0000-4000-8000-000000000002";
test("all recurrence presets round trip through the same command contract", () => {
  const defaults = initialSchedule("2026-09-20");
  for (const kind of [
    "one_off",
    "daily",
    "weekdays",
    "weekly",
    "biweekly",
    "monthly",
    "after_completion",
  ]) {
    const parsed = parseRoutineDraft(" Water plants ", { ...defaults, kind }, "shared", member);
    assert.equal(parsed._tag, "Success", kind);
    assert.equal(parsed.value.title, "Water plants");
    assert.equal(parsed.value.schedule.kind, kind);
    assert.deepEqual(parsed.value.assignment, { policy: "shared" });
    assert.ok(scheduleLabel(parsed.value.schedule).length > 0);
  }
});
test("draft rejects empty weekday sets, invalid dates, noninteger and overflowing intervals", () => {
  const defaults = initialSchedule("2026-09-20");
  const invalid = [
    { kind: "weekdays", days: [] },
    { kind: "weekdays", days: [1, 1] },
    { kind: "one_off", date: "2026-02-30" },
    { kind: "monthly", dayOfMonth: 32 },
    ...["", "0", "-1", "1.5", "1e2", " 2", "2147483648"].map((every) => ({
      kind: "after_completion",
      every,
    })),
  ];
  for (const patch of invalid)
    assert.equal(
      parseRoutineDraft("Valid", { ...defaults, ...patch }, "shared", member)._tag,
      "Failure",
      JSON.stringify(patch),
    );
});
test("responsibility is explicit and alternating preserves the selected first member", () => {
  for (const policy of ["assigned", "alternating"]) {
    const result = parseRoutineDraft("Task", initialSchedule("2026-09-20"), policy, member);
    assert.equal(result._tag, "Success");
    assert.deepEqual(
      result.value.assignment,
      policy === "assigned" ? { policy, memberId: member } : { policy, anchorMemberId: member },
    );
  }
  assert.equal(
    parseRoutineDraft("Task", initialSchedule("2026-09-20"), "assigned", "")._tag,
    "Failure",
  );
});
