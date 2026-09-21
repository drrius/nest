import * as Schema from "effect/Schema";
import { MealPreparationDraft } from "@nest/contracts/meal-preparation";
export type PreparationDraft = {
  title: string;
  instructions: string;
  dueOn: string;
  policy: "shared" | "assigned" | "alternating";
  member: string;
};
export function parsePreparationDraft(draft: PreparationDraft) {
  const assignment =
    draft.policy === "shared"
      ? { policy: draft.policy }
      : draft.policy === "assigned"
        ? { policy: draft.policy, memberId: draft.member }
        : { policy: draft.policy, anchorMemberId: draft.member };
  return Schema.decodeUnknownExit(MealPreparationDraft)(
    {
      title: draft.title,
      instructions: draft.instructions || null,
      dueOn: draft.dueOn,
      assignment,
    },
    { onExcessProperty: "error" },
  );
}
export function preparationDraftDirty(draft: PreparationDraft, initialDate: string) {
  return (
    draft.title !== "" ||
    draft.instructions !== "" ||
    draft.dueOn !== initialDate ||
    draft.policy !== "shared"
  );
}
