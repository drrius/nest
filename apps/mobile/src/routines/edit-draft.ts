import * as Schema from "effect/Schema";
import {
  RoutinePatch,
  type Routine,
  type RoutineAssignment,
  type RoutineSchedule,
} from "@nest/contracts/routines";
import { initialSchedule, scheduleValue, type ScheduleDraft } from "./draft.ts";

export function scheduleDraft(schedule: RoutineSchedule, today: string): ScheduleDraft {
  const base = { ...initialSchedule(today), kind: schedule.kind };
  switch (schedule.kind) {
    case "one_off":
      return { ...base, date: schedule.date };
    case "weekdays":
      return { ...base, days: [...schedule.days] };
    case "weekly":
    case "biweekly":
      return { ...base, weekday: schedule.weekday };
    case "monthly":
      return { ...base, dayOfMonth: schedule.dayOfMonth };
    case "after_completion":
      return { ...base, every: String(schedule.every), unit: schedule.unit };
    case "daily":
      return base;
  }
}

export function routineEditPatch(
  original: Routine["definition"],
  title: string,
  schedule: ScheduleDraft,
  assignment: RoutineAssignment,
) {
  const patch: Record<string, unknown> = {};
  // Compare before trimming: a schedule-only edit must not normalize a historical title.
  if (title !== original.title) patch.title = title.trim();
  const nextSchedule = scheduleValue(schedule);
  const previousSchedule = scheduleValue(scheduleDraft(original.schedule, ""));
  if (JSON.stringify(nextSchedule) !== JSON.stringify(previousSchedule))
    patch.schedule = nextSchedule;
  if (JSON.stringify(assignment) !== JSON.stringify(original.assignment))
    patch.assignment = assignment;
  if (Object.keys(patch).length === 0) return { status: "unchanged" } as const;
  const result = Schema.decodeUnknownExit(RoutinePatch)(patch, { onExcessProperty: "error" });
  return result._tag === "Failure"
    ? ({ status: "invalid" } as const)
    : ({ status: "changed", patch: result.value } as const);
}
