import type { RecurringHistoryEntry } from "@nest/contracts/recurring-history";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
export function cycleHistoryPage(view: RecurringReadView) {
  if (!view.active || !view.online || view.busy || view.verify) return null;
  if (view.target.kind !== "history" || view.entry?.kind !== "history") return null;
  const page = view.entry.value;
  return page.ruleId === view.target.ruleId && page.before === view.target.before ? page : null;
}
export function cycleOriginText(row: typeof RecurringHistoryEntry.Type, actor: string) {
  const member = row.recordedBy === actor ? "you" : "the other household member";
  switch (row.source) {
    case "automatic":
      return `Posted automatically · mandate authorized by ${member}`;
    case "variable":
      return `Variable bill confirmed by ${member}`;
    case "manual":
      return `Existing expense linked by ${member} · no new expense created`;
  }
}
export const cycleExpenseTarget = (eventId: string) => ({
  pathname: "/money-event" as const,
  params: { eventId },
});
