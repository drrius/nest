import type { LegacyDraftContext } from "@nest/contracts/legacy-draft-dismissal";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { LegacyDismissalSaveView } from "./legacy-dismissal-save-runtime.ts";
import { legacyDismissalAttempt } from "./legacy-dismissal-save-attempt.ts";
import { legacyDateText, legacyDescription } from "./legacy-recurring-display.ts";
import { formatChf } from "./format.ts";
export function dismissalRequestEnabled(view: LegacyDismissalSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function currentDismissalDraft(read: RecurringReadView) {
  if (!read.active || !read.online || read.busy || read.verify) return null;
  if (read.target.kind !== "legacy-review" || read.entry?.kind !== "legacy-review") return null;
  const context = read.entry.value;
  return context.draft.draftId === read.target.draftId ? context : null;
}
export function dismissalContext(read: RecurringReadView, save: LegacyDismissalSaveView) {
  if (!dismissalRequestEnabled(save) || save.attempt || save.result) return null;
  const context = currentDismissalDraft(read);
  if (!context) return null;
  const draft = context.draft;
  return draft.status === "pending" && draft.sourceKind === "recurring" && draft.eventId === null
    ? context
    : null;
}
export function prepareDismissal(context: typeof LegacyDraftContext.Type, operationId: string) {
  return {
    context,
    command: legacyDismissalAttempt({
      operationId,
      input: {
        draftId: context.draft.draftId,
        ruleId: context.draft.ruleId,
        reviewToken: context.reviewToken,
      },
    }).command,
  };
}
export function dismissalConfirmationCurrent(
  expected: ReturnType<typeof prepareDismissal>,
  current: ReturnType<typeof dismissalContext>,
) {
  return current !== null && current === expected.context;
}
export function dismissalText(context: typeof LegacyDraftContext.Type, actor: string) {
  const row = context.draft;
  const name = (member: string | null) =>
    member === null ? "Not specified" : member === actor ? "You" : "Other household member";
  return [
    legacyDescription(row.description),
    `Date: ${legacyDateText(row.occurredOn)}\nAmount: ${row.amountCentimes === null ? "Not specified" : formatChf(row.amountCentimes)}\nPayer: ${name(row.payerId)}`,
    row.allocations.kind === "valid"
      ? row.allocations.shares
          .map((s) => `${name(s.memberId)}: ${formatChf(s.centimes)}`)
          .join("\n")
      : "Retained split needs review; no replacement is assumed.",
    `Draft reference: ${row.draftId}\nRule reference: ${row.ruleId}`,
    "Dismiss this unposted draft? It stays in history as dismissed. No expense or payment is recorded, no balance changes, and the recurring rule is not paused or cancelled.",
  ].join("\n\n");
}
