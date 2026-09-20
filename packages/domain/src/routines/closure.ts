// Audited from household-os 4a528c9; see docs/native-rewrite/routine-rules-audit.md.
import { compareIsoDates } from "./dates.ts";
import { nextDueAfterClosure } from "./schedule.ts";
import { buildSuccessorPair, planAfterClosingCurrent } from "./succession.ts";
import type {
  Assignment,
  IsoDate,
  MemberId,
  OccurrenceId,
  OccurrenceRole,
  OccurrenceStatus,
  ScheduleRule,
} from "./types.ts";

export type OpenOccurrence = {
  id: OccurrenceId;
  role: OccurrenceRole;
  dueDate: IsoDate;
  originalDueDate: IsoDate;
  plannedAssigneeId: MemberId | null;
  status: "open";
};

export type ClosureCommand =
  | {
      kind: "complete";
      occurrenceId: OccurrenceId;
      actorMemberId: MemberId;
      completedOn: IsoDate;
    }
  | {
      kind: "skip";
      occurrenceId: OccurrenceId;
      actorMemberId: MemberId;
    }
  | {
      kind: "reschedule";
      occurrenceId: OccurrenceId;
      actorMemberId: MemberId;
      newDueDate: IsoDate;
    };

export type PlannedOccurrence = {
  role: OccurrenceRole;
  dueDate: IsoDate;
  originalDueDate: IsoDate;
  plannedAssigneeId: MemberId | null;
  status: "open";
};

export type ClosureActivityKind =
  | "occurrence_completed"
  | "occurrence_skipped"
  | "occurrence_rescheduled";

export type ClosurePlan = {
  closedOccurrenceId: OccurrenceId;
  nextStatus: Exclude<OccurrenceStatus, "open"> | "open";
  completion: {
    completedByMemberId: MemberId;
    completedOn: IsoDate;
  } | null;
  rescheduledDueDate: IsoDate | null;
  promotePreviewToCurrent: boolean;
  discardPreview: boolean;
  createOccurrences: PlannedOccurrence[];
  activityKind: ClosureActivityKind;
};

export type ClosurePlanError = {
  code:
    | "occurrence_not_found"
    | "not_current_occurrence"
    | "routine_inactive"
    | "invalid_reschedule_date";
  message: string;
};

export type ClosurePlanResult =
  | { ok: true; plan: ClosurePlan }
  | { ok: false; error: ClosurePlanError };

export type RoutineClosureContext = {
  assignment: Assignment;
  members: readonly [MemberId, MemberId];
  scheduleRule: ScheduleRule;
  active: boolean;
  current: OpenOccurrence | null;
  preview: OpenOccurrence | null;
};

const closureVerbs: Record<ClosureCommand["kind"], string> = {
  complete: "completed",
  skip: "skipped",
  reschedule: "rescheduled",
};

function closureError(code: ClosurePlanError["code"], message: string): ClosurePlanResult {
  return { ok: false, error: { code, message } };
}

function completionPlan(
  context: RoutineClosureContext,
  target: OpenOccurrence,
  command: Extract<ClosureCommand, { kind: "complete" }>,
): ClosurePlan {
  return {
    closedOccurrenceId: target.id,
    nextStatus: "completed",
    completion: {
      completedByMemberId: command.actorMemberId,
      completedOn: command.completedOn,
    },
    rescheduledDueDate: null,
    ...planAfterClosingCurrent({
      context,
      closed: target,
      completedOn: command.completedOn,
    }),
    activityKind: "occurrence_completed",
  };
}

function skipPlan(context: RoutineClosureContext, target: OpenOccurrence): ClosurePlan {
  return {
    closedOccurrenceId: target.id,
    nextStatus: "skipped",
    completion: null,
    rescheduledDueDate: null,
    ...planAfterClosingCurrent({ context, closed: target }),
    activityKind: "occurrence_skipped",
  };
}

function reschedulePlan(target: OpenOccurrence, newDueDate: IsoDate): ClosurePlan {
  return {
    closedOccurrenceId: target.id,
    nextStatus: "open",
    completion: null,
    rescheduledDueDate: newDueDate,
    promotePreviewToCurrent: false,
    discardPreview: false,
    createOccurrences: [],
    activityKind: "occurrence_rescheduled",
  };
}

function findOccurrence(context: RoutineClosureContext, id: OccurrenceId): OpenOccurrence | null {
  if (context.current?.id === id) return context.current;
  if (context.preview?.id === id) return context.preview;
  return null;
}

export function planOccurrenceClosure(
  context: RoutineClosureContext,
  command: ClosureCommand,
): ClosurePlanResult {
  const target = findOccurrence(context, command.occurrenceId);

  if (target === null) {
    return closureError("occurrence_not_found", "Occurrence is not part of this routine window");
  }

  if (target.role !== "current") {
    return closureError(
      "not_current_occurrence",
      `Only the current occurrence can be ${closureVerbs[command.kind]}`,
    );
  }

  switch (command.kind) {
    case "complete":
      return { ok: true, plan: completionPlan(context, target, command) };
    case "skip":
      return { ok: true, plan: skipPlan(context, target) };
    case "reschedule":
      if (compareIsoDates(command.newDueDate, target.dueDate) === 0) {
        return closureError(
          "invalid_reschedule_date",
          "Reschedule date must differ from the current due date",
        );
      }

      return { ok: true, plan: reschedulePlan(target, command.newDueDate) };
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function planInitialOccurrenceWindow(input: {
  assignment: Assignment;
  members: readonly [MemberId, MemberId];
  scheduleRule: ScheduleRule;
  firstDueDate: IsoDate;
}): PlannedOccurrence[] {
  const secondDue = nextDueAfterClosure({
    rule: input.scheduleRule,
    closedDueDate: input.firstDueDate,
  });

  return buildSuccessorPair({
    assignment: input.assignment,
    members: input.members,
    previousPlannedAssignee: null,
    currentDue: input.firstDueDate,
    previewDue: secondDue,
  });
}
