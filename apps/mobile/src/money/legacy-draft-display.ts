import type { LegacyRecurringDraft } from "@nest/contracts/legacy-recurring-drafts";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
export function legacyDraftPage(view: RecurringReadView) {
  if (!view.active || !view.online || view.busy || view.verify) return null;
  if (view.target.kind !== "legacy-drafts" || view.entry?.kind !== "legacy-drafts") return null;
  const page = view.entry.value;
  return page.ruleId === view.target.ruleId && page.after === view.target.after ? page : null;
}
export function legacyDraftWarning(row: typeof LegacyRecurringDraft.Type) {
  if (row.status === "posted" && row.eventId === null)
    return "Needs reconciliation: marked posted, but no financial event is linked.";
  if (row.status !== "posted" && row.eventId !== null)
    return "Needs reconciliation: a financial event is already linked. Do not record this expense again.";
  return null;
}
