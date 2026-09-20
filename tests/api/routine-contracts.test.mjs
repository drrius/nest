import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
import {
  CreateRoutine,
  EditRoutine,
  RoutineSchedule,
  RoutineAssignment,
  RoutineVersion,
  RescheduleChore,
  RoutineStateCommand,
} from "../../packages/contracts/src/routines.ts";
const id = "00000000-0000-4000-8000-000000000001";
const definition = {
  title: "Clean the kitchen",
  schedule: { kind: "daily" },
  assignment: { policy: "shared" },
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });

test("routine commands reject hidden legacy fields, coerced values and malformed recurrence", () => {
  const command = { operationId: id, definition };
  assert.deepEqual(decode(CreateRoutine, command), command);
  for (const extra of ["householdId", "actorId", "areaId", "petId", "note", "photoPath"])
    assert.throws(() => decode(CreateRoutine, { ...command, [extra]: id }));
  for (const schedule of [
    { kind: "daily", date: "2026-09-20" },
    { kind: "weekly", weekday: "1" },
    { kind: "weekly", weekday: 0 },
    { kind: "weekly", weekday: 8 },
    { kind: "weekdays", days: [] },
    { kind: "weekdays", days: [1, 1] },
    { kind: "monthly", dayOfMonth: 1.5 },
    { kind: "monthly", dayOfMonth: 32 },
    { kind: "after_completion", every: 0, unit: "days" },
    { kind: "after_completion", every: 2147483648, unit: "days" },
    { kind: "after_completion", every: 1, unit: "months" },
    { kind: "one_off", date: "2026-02-30" },
  ])
    assert.throws(() => decode(RoutineSchedule, schedule));
  for (const title of ["", "  ", "a".repeat(121), "hidden\u0000suffix"])
    assert.throws(() =>
      decode(CreateRoutine, { ...command, definition: { ...definition, title } }),
    );
});

test("assignment shape is explicit and shared work cannot silently acquire an owner", () => {
  for (const assignment of [
    { policy: "shared" },
    { policy: "assigned", memberId: id },
    { policy: "alternating", anchorMemberId: id },
  ])
    assert.deepEqual(decode(RoutineAssignment, assignment), assignment);
  for (const assignment of [
    { policy: "shared", memberId: id },
    { policy: "assigned" },
    { policy: "alternating", memberId: id },
    { policy: "assigned", memberId: "outsider" },
  ])
    assert.throws(() => decode(RoutineAssignment, assignment));
});

test("edit versions preserve all PostgreSQL microseconds without accepting normalized dates", () => {
  const version = "2026-09-20T08:00:00.123456Z";
  const edit = { operationId: id, routineId: id, expectedVersion: version, definition };
  assert.equal(decode(EditRoutine, edit).expectedVersion, version);
  for (const invalid of [
    "2026-02-30T08:00:00.123456Z",
    "0000-01-01T08:00:00.123456Z",
    "2026-09-20T24:00:00.123456Z",
    "2026-09-20T08:00:00.123Z",
    `${version}\n`,
    `${version}\r`,
    `${version}\u2028`,
    version.replace("Z", "+00:00"),
  ])
    assert.throws(() => decode(RoutineVersion, invalid));
  for (let microsecond = 0; microsecond < 1000000; microsecond += 997) {
    const exact = `2026-09-20T08:00:00.${String(microsecond).padStart(6, "0")}Z`;
    assert.equal(decode(RoutineVersion, exact), exact);
  }
});

test("skip/reschedule and lifecycle inputs carry exact baselines and finite actions", () => {
  const move = {
    operationId: id,
    occurrenceId: id,
    expectedDueDate: "2026-09-20",
    newDueDate: "2026-09-21",
  };
  assert.deepEqual(decode(RescheduleChore, move), move);
  assert.throws(() => decode(RescheduleChore, { ...move, newDueDate: move.expectedDueDate }));
  const change = {
    operationId: id,
    routineId: id,
    expectedVersion: "2026-09-20T08:00:00.000001Z",
    action: "pause",
  };
  assert.deepEqual(decode(RoutineStateCommand, change), change);
  assert.throws(() => decode(RoutineStateCommand, { ...change, action: "delete" }));
  assert.throws(() => decode(RoutineStateCommand, { ...change, expectedVersion: undefined }));
});

test("all supported recurrence presets round-trip without changing weekday order or dates", () => {
  for (const schedule of [
    { kind: "one_off", date: "0001-01-01" },
    { kind: "daily" },
    { kind: "weekdays", days: [7, 1, 3] },
    { kind: "weekly", weekday: 7 },
    { kind: "biweekly", weekday: 1 },
    { kind: "monthly", dayOfMonth: 31 },
    { kind: "after_completion", every: 2147483647, unit: "days" },
    { kind: "after_completion", every: 2, unit: "weeks" },
  ])
    assert.deepEqual(decode(RoutineSchedule, schedule), schedule);
});

test("routine titles reject unpaired UTF-16 surrogates while preserving valid emoji", () => {
  for (const title of ["\ud800", "\udfff", "Clean \ud800 kitchen", "\ud800x\udfff", "\udfff\ud800"])
    assert.throws(() =>
      decode(CreateRoutine, { operationId: id, definition: { ...definition, title } }),
    );
  for (const title of ["Clean 🧹 kitchen", "🧹".repeat(60), "Café"])
    assert.equal(
      decode(CreateRoutine, { operationId: id, definition: { ...definition, title } }).definition
        .title,
      title,
    );
});
