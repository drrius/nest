import type { LegacyRecurringDate, LegacyRecurringRule } from "@nest/contracts/legacy-recurring";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
export function legacyRecurringPage(view: RecurringReadView) {
  if (!view.active || !view.online || view.busy || view.verify) return null;
  if (view.target.kind !== "legacy" || view.entry?.kind !== "legacy") return null;
  return view.entry.value.after === view.target.after ? view.entry.value : null;
}
export function legacyDescription(description: string) {
  return description.trim() || "Legacy expense with a whitespace-only description";
}
export function legacyDateText(date: typeof LegacyRecurringDate.Type | null) {
  if (date === null) return "None recorded";
  return date.kind === "date" ? date.value : `Needs review (${date.value})`;
}
export function legacyWarnings(row: typeof LegacyRecurringRule.Type) {
  const warnings: string[] = [];
  if (row.allocations.kind === "needs_review")
    warnings.push("The retained split needs review. No replacement split has been assumed.");
  if (row.updatedAt.kind === "unsupported")
    warnings.push("The legacy edit version needs review before this rule can be adopted.");
  if (row.drafts.postedWithoutEvent !== "0")
    warnings.push(`${row.drafts.postedWithoutEvent} posted drafts have no linked financial event.`);
  if (row.drafts.unpostedWithEvent !== "0")
    warnings.push(
      `${row.drafts.unpostedWithEvent} pending or dismissed drafts already have a linked financial event.`,
    );
  if (row.drafts.unsupportedDates !== "0")
    warnings.push(`${row.drafts.unsupportedDates} drafts have dates that need review.`);
  return warnings;
}
