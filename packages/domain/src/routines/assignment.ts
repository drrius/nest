// Audited from household-os 4a528c9; see docs/native-rewrite/routine-rules-audit.md.
import type { Assignment, MemberId } from "./types.ts";

export type AssignmentValidationError = {
  code:
    | "assigned_requires_member"
    | "alternating_requires_anchor"
    | "shared_forbids_member"
    | "member_not_in_household"
    | "household_requires_two_members";
  message: string;
};

export type AssignmentValidationResult =
  | { ok: true; assignment: Assignment }
  | { ok: false; error: AssignmentValidationError };

export function validateAssignment(
  assignment: Assignment,
  memberIds: readonly MemberId[],
): AssignmentValidationResult {
  if (memberIds.length !== 2 || new Set(memberIds).size !== 2) {
    return {
      ok: false,
      error: {
        code: "household_requires_two_members",
        message: "Version one assignment requires exactly two household members",
      },
    };
  }

  const memberSet = new Set(memberIds);

  switch (assignment.policy) {
    case "assigned":
      if (!memberSet.has(assignment.memberId)) {
        return {
          ok: false,
          error: {
            code: "member_not_in_household",
            message: "assigned member must belong to the household",
          },
        };
      }

      return { ok: true, assignment };
    case "alternating":
      if (!memberSet.has(assignment.anchorMemberId)) {
        return {
          ok: false,
          error: {
            code: "member_not_in_household",
            message: "rotation anchor must belong to the household",
          },
        };
      }

      return { ok: true, assignment };
    case "shared":
      return { ok: true, assignment };
    default: {
      const _exhaustive: never = assignment;
      return _exhaustive;
    }
  }
}

export function otherMember(members: readonly [MemberId, MemberId], memberId: MemberId): MemberId {
  if (members[0] === members[1]) throw new Error("Household members must be distinct");
  if (members[0] === memberId) {
    return members[1];
  }

  if (members[1] === memberId) {
    return members[0];
  }

  throw new Error("memberId is not one of the household members");
}

export function plannedAssigneeForIndex(input: {
  assignment: Assignment;
  members: readonly [MemberId, MemberId];
  occurrenceIndex: number;
}): MemberId | null {
  const { assignment, members, occurrenceIndex } = input;

  if (!Number.isSafeInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new Error("occurrenceIndex must be a non-negative safe integer");
  }

  switch (assignment.policy) {
    case "assigned":
      return assignment.memberId;
    case "shared":
      return null;
    case "alternating": {
      const anchor = assignment.anchorMemberId;
      const partner = otherMember(members, anchor);
      return occurrenceIndex % 2 === 0 ? anchor : partner;
    }
    default: {
      const _exhaustive: never = assignment;
      return _exhaustive;
    }
  }
}

export function nextPlannedAssignee(input: {
  assignment: Assignment;
  members: readonly [MemberId, MemberId];
  previousPlannedAssignee: MemberId | null;
}): MemberId | null {
  const { assignment, members, previousPlannedAssignee } = input;

  switch (assignment.policy) {
    case "assigned":
      return assignment.memberId;
    case "shared":
      return null;
    case "alternating": {
      if (previousPlannedAssignee === null) {
        return assignment.anchorMemberId;
      }

      return otherMember(members, previousPlannedAssignee);
    }
    default: {
      const _exhaustive: never = assignment;
      return _exhaustive;
    }
  }
}
