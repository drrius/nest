import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import {
  planInitialOccurrenceWindow,
  planOccurrenceClosure,
  validateAssignment,
  plannedAssigneeForIndex,
} from "../src/routines/index.ts";
const members = ["alice", "bob"];
function context(
  scheduleRule = { kind: "daily" },
  assignment = { policy: "alternating", anchorMemberId: "alice" },
) {
  const window = planInitialOccurrenceWindow({
    assignment,
    members,
    scheduleRule,
    firstDueDate: "2026-09-20",
  });
  return {
    assignment,
    members,
    scheduleRule,
    active: true,
    current: { ...window[0], id: "current" },
    preview: window[1] ? { ...window[1], id: "preview" } : null,
  };
}
const complete = (actorMemberId) => ({
  kind: "complete",
  occurrenceId: "current",
  actorMemberId,
  completedOn: "2026-09-20",
});
function plan(ctx, command) {
  const result = planOccurrenceClosure(ctx, command);
  assert.equal(result.ok, true);
  return result.plan;
}

test("completion promotes the preview and alternates planned turns regardless of who completes", () => {
  for (const member of members) {
    const result = plan(context(), complete(member));
    assert.equal(result.promotePreviewToCurrent, true);
    assert.equal(result.discardPreview, false);
    assert.deepEqual(result.createOccurrences, [
      {
        role: "preview",
        dueDate: "2026-09-22",
        originalDueDate: "2026-09-22",
        plannedAssigneeId: "alice",
        status: "open",
      },
    ]);
    assert.equal(result.completion.completedByMemberId, member);
  }
});

test("reschedule preserves preview; one-off and inactive closure create no future work", () => {
  const result = plan(context(), {
    kind: "reschedule",
    occurrenceId: "current",
    actorMemberId: "alice",
    newDueDate: "2026-09-25",
  });
  assert.equal(result.nextStatus, "open");
  assert.equal(result.discardPreview, false);
  assert.deepEqual(result.createOccurrences, []);
  for (const ctx of [
    context({ kind: "one_off", date: "2026-09-20" }),
    { ...context(), active: false },
  ]) {
    const closed = plan(ctx, complete("alice"));
    assert.equal(closed.promotePreviewToCurrent, false);
    assert.equal(closed.discardPreview, true);
    assert.deepEqual(closed.createOccurrences, []);
  }
});

test("preview, missing target and unchanged reschedule fail without a mutation plan", () => {
  for (const [command, code] of [
    [{ ...complete("alice"), occurrenceId: "preview" }, "not_current_occurrence"],
    [{ ...complete("alice"), occurrenceId: "missing" }, "occurrence_not_found"],
    [
      {
        kind: "reschedule",
        occurrenceId: "current",
        actorMemberId: "alice",
        newDueDate: "2026-09-20",
      },
      "invalid_reschedule_date",
    ],
  ]) {
    const result = planOccurrenceClosure(context(), command);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
  }
});

test("assignment validation excludes outsiders and duplicate household members", () => {
  assert.equal(validateAssignment({ policy: "shared" }, members).ok, true);
  assert.equal(validateAssignment({ policy: "shared" }, ["alice", "alice"]).ok, false);
  assert.equal(validateAssignment({ policy: "assigned", memberId: "outsider" }, members).ok, false);
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1000000 }), (index) => {
      assert.equal(
        plannedAssigneeForIndex({
          assignment: context().assignment,
          members,
          occurrenceIndex: index,
        }),
        members[index % 2],
      );
    }),
    { seed: 20260920, numRuns: 1000 },
  );
});

test("generated completion and skip plans retain exactly one current and one preview", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 365 }),
      fc.boolean(),
      fc.boolean(),
      (every, shared, skip) => {
        const ctx = context(
          { kind: "after_completion", every, unit: "days" },
          shared ? { policy: "shared" } : context().assignment,
        );
        const result = plan(
          ctx,
          skip ? { kind: "skip", occurrenceId: "current", actorMemberId: "bob" } : complete("bob"),
        );
        assert.equal(result.promotePreviewToCurrent, false);
        assert.equal(result.discardPreview, true);
        assert.deepEqual(
          result.createOccurrences.map((x) => x.role),
          ["current", "preview"],
        );
        assert.ok(result.createOccurrences[0].dueDate < result.createOccurrences[1].dueDate);
        assert.deepEqual(
          result.createOccurrences.map((x) => x.plannedAssigneeId),
          shared ? [null, null] : ["bob", "alice"],
        );
      },
    ),
    { seed: 20260922, numRuns: 1000 },
  );
});
