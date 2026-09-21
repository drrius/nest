import * as Schema from "effect/Schema";
import { MealPreparationPatch } from "@nest/contracts/meal-preparation-edit";
import type { MealPreparation } from "@nest/contracts/meal-preparation-read";
import type { PreparationDraft } from "./preparation-draft.ts";
export function preparationEditValues(task: MealPreparation): PreparationDraft {
  const assignment = task.assignment;
  return {
    title: task.title,
    instructions: task.instructions ?? "",
    dueOn: task.dueOn,
    policy: assignment.policy,
    member:
      assignment.policy === "assigned"
        ? assignment.memberId
        : assignment.policy === "alternating"
          ? assignment.anchorMemberId
          : "",
  };
}
function changedFields(task: MealPreparation, draft: PreparationDraft) {
  const initial = preparationEditValues(task);
  const patch: Record<string, unknown> = {};
  if (draft.title !== initial.title) patch.title = draft.title;
  if (draft.instructions !== initial.instructions) patch.instructions = draft.instructions || null;
  if (draft.dueOn !== initial.dueOn) patch.dueOn = draft.dueOn;
  if (
    draft.policy !== initial.policy ||
    (draft.policy !== "shared" && draft.member !== initial.member)
  )
    patch.assignment =
      draft.policy === "shared"
        ? { policy: draft.policy }
        : draft.policy === "assigned"
          ? { policy: draft.policy, memberId: draft.member }
          : { policy: draft.policy, anchorMemberId: draft.member };
  return patch;
}
export function preparationEditDirty(task: MealPreparation, draft: PreparationDraft) {
  return Object.keys(changedFields(task, draft)).length > 0;
}
export function preparationEditPatch(task: MealPreparation, draft: PreparationDraft) {
  const patch = changedFields(task, draft);
  if (Object.keys(patch).length === 0) return { status: "unchanged" } as const;
  if (
    task.status !== "open" &&
    (Object.hasOwn(patch, "dueOn") || Object.hasOwn(patch, "assignment"))
  )
    return { status: "finished" } as const;
  const result = Schema.decodeUnknownExit(MealPreparationPatch)(patch, {
    onExcessProperty: "error",
  });
  return result._tag === "Failure"
    ? ({ status: "invalid" } as const)
    : ({ status: "changed", patch: result.value } as const);
}
