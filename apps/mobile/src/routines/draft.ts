import * as Schema from "effect/Schema";
import { RoutineDefinition, type RoutineSchedule } from "@nest/contracts/routines";
export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export type ScheduleDraft = {
  kind: RoutineSchedule["kind"];
  date: string;
  weekday: number;
  days: number[];
  dayOfMonth: number;
  every: string;
  unit: "days" | "weeks";
};
export function initialSchedule(date: string): ScheduleDraft {
  return {
    kind: "daily",
    date,
    weekday: 1,
    days: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    every: "1",
    unit: "days",
  };
}
export function scheduleValue(draft: ScheduleDraft) {
  switch (draft.kind) {
    case "one_off":
      return { kind: draft.kind, date: draft.date };
    case "daily":
      return { kind: draft.kind };
    case "weekdays":
      return { kind: draft.kind, days: draft.days };
    case "weekly":
    case "biweekly":
      return { kind: draft.kind, weekday: draft.weekday };
    case "monthly":
      return { kind: draft.kind, dayOfMonth: draft.dayOfMonth };
    case "after_completion":
      return {
        kind: draft.kind,
        every: /^\d+$/.test(draft.every) ? Number(draft.every) : NaN,
        unit: draft.unit,
      };
  }
}
export function parseRoutineDraft(
  title: string,
  schedule: ScheduleDraft,
  policy: "shared" | "assigned" | "alternating",
  memberId: string,
) {
  const assignment =
    policy === "shared"
      ? { policy }
      : policy === "assigned"
        ? { policy, memberId }
        : { policy, anchorMemberId: memberId };
  return Schema.decodeUnknownExit(RoutineDefinition)({
    title: title.trim(),
    schedule: scheduleValue(schedule),
    assignment,
  });
}
export function scheduleLabel(schedule: RoutineSchedule): string {
  switch (schedule.kind) {
    case "daily":
      return "Every day";
    case "one_off":
      return `One time · ${schedule.date}`;
    case "weekdays":
      return schedule.days.map((day) => weekdays[day - 1]).join(", ");
    case "weekly":
      return `Every ${weekdays[schedule.weekday - 1]}`;
    case "biweekly":
      return `Every other ${weekdays[schedule.weekday - 1]}`;
    case "monthly":
      return `Monthly · day ${schedule.dayOfMonth} (last day in shorter months)`;
    case "after_completion":
      return `${schedule.every} ${schedule.unit} after completion`;
  }
}
