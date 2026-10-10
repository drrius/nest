import assert from "node:assert/strict";
import { test } from "node:test";
import {
  preparationEditValues,
  preparationEditPatch,
  preparationEditDirty,
} from "../src/meals/preparation-edit-draft.ts";
const id = "00000000-0000-4000-8000-000000000002";
const task = {
  title: "Legacy title ".repeat(12),
  instructions: "🍲".repeat(3000),
  dueOn: "2030-01-06",
  assignment: { policy: "assigned", memberId: id },
  status: "open",
};
test("preparation editing preserves omitted legacy text and encodes explicit instruction clearing", () => {
  const initial = preparationEditValues(task);
  assert.equal(preparationEditDirty(task, initial), false);
  assert.deepEqual(preparationEditPatch(task, initial), { status: "unchanged" });
  assert.deepEqual(preparationEditPatch(task, { ...initial, dueOn: "2030-01-05" }), {
    status: "changed",
    patch: { dueOn: "2030-01-05" },
  });
  assert.deepEqual(preparationEditPatch(task, { ...initial, instructions: "" }), {
    status: "changed",
    patch: { instructions: null },
  });
  assert.equal(
    preparationEditPatch(task, { ...initial, title: "x".repeat(121) }).status,
    "invalid",
  );
  assert.equal(
    preparationEditPatch(task, { ...initial, instructions: "\uD800" }).status,
    "invalid",
  );
});
test("finished preparation permits only text corrections and dirty state includes responsibility", () => {
  const finished = { ...task, status: "completed" },
    initial = preparationEditValues(finished);
  assert.deepEqual(preparationEditPatch(finished, { ...initial, title: "Corrected" }), {
    status: "changed",
    patch: { title: "Corrected" },
  });
  for (const patch of [{ dueOn: "2030-01-05" }, { policy: "shared" }]) {
    assert.equal(preparationEditDirty(finished, { ...initial, ...patch }), true);
    assert.equal(preparationEditPatch(finished, { ...initial, ...patch }).status, "finished");
  }
  for (const instructions of [null, ""]) {
    const empty = { ...task, instructions };
    assert.equal(preparationEditPatch(empty, preparationEditValues(empty)).status, "unchanged");
  }
});
