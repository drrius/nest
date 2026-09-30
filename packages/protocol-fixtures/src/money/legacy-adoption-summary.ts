import type { AdoptionFormContext } from "./legacy-adoption-draft.ts";
import { formatChf } from "./format.ts";
import { legacyDescription, legacyDateText } from "./legacy-recurring-display.ts";
import type { LegacyAdoptionBlocker } from "@nest/contracts/legacy-adoption";
import type { LegacyAdoptionSave } from "./legacy-adoption-client.ts";
import { recurringConfirmationText } from "./recurring-confirmation.ts";
export const adoptionBlockerText: Record<typeof LegacyAdoptionBlocker.Type, string> = {
  already_adopted: "This rule is already adopted. Open its native configuration to manage it.",
  native_identity_in_use:
    "This rule ID already belongs to a native configuration. Reconcile that identity before adopting it.",
  pending_drafts:
    "Review every pending legacy draft: explicitly confirm or dismiss it before adopting this rule.",
  unreconciled_history:
    "A draft status and its financial-event link disagree. Financial history must be reconciled before adoption.",
  unsupported_history_dates:
    "Historical dates or their covered period are outside the supported range. Reconciliation is required; no replacement date is assumed.",
};
export function adoptionConfirmationText(
  command: LegacyAdoptionSave,
  actor: string,
  coveredThrough: string | null | undefined,
) {
  return [
    recurringConfirmationText(
      { operationId: command.operationId, rule: { ...command.input, expectedRevision: null } },
      actor,
    ),
    coveredThrough === undefined
      ? "The original coverage boundary will be shown in the recovered receipt. The saved first cycle remains bound to the reviewed source."
      : `Retained history is covered through: ${coveredThrough ?? "No retained periods"}. No new cycle may overlap it.`,
    "The old draft generator will stop. Original drafts and financial events remain in history, with the same rule identity.",
    `Note: ${command.input.configuration.note ?? "None"}`,
  ].join("\n\n");
}

export function adoptionSourceText(
  context: Pick<AdoptionFormContext, "review" | "category"> & {
    options: { members: readonly { actorId: string; displayName: string }[] };
  },
  actor: string,
) {
  const row = context.review.rule;
  const member = (id: string) =>
    context.options.members.find((entry) => entry.actorId === id)?.displayName ??
    (id === actor ? "You" : "Other household member");
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return [
    "Original retained rule",
    legacyDescription(row.description),
    `Amount: ${formatChf(row.amountCentimes)}. Payer: ${member(row.payerId)}.`,
    row.allocations.kind === "valid"
      ? row.allocations.shares
          .map((share) => `${member(share.memberId)}: ${formatChf(share.centimes)}`)
          .join("\n")
      : "Original split needs review; no replacement is assumed.",
    row.schedule.kind === "weekly"
      ? `Every ${weekdays[row.schedule.weekday - 1]}.`
      : `Monthly, day ${row.schedule.dayOfMonth}.`,
    `Category: ${row.categoryId === null ? "None" : context.category ? `${context.category.name}${context.category.archived ? " (archived)" : ""}` : "Unavailable retained category"}.`,
    `Legacy draft generation: ${row.active ? "Active" : "Paused"}. Next draft: ${legacyDateText(row.nextOccurrenceOn)}.`,
  ].join("\n\n");
}
export function adoptionReviewText(
  command: LegacyAdoptionSave,
  actor: string,
  context: AdoptionFormContext,
) {
  return `${adoptionSourceText(context, actor)}\n\nNew configuration to authorize\n\n${adoptionConfirmationText(command, actor, context.review.coveredThrough)}`;
}
