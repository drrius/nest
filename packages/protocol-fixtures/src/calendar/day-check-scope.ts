import type { CalendarView } from "./runtime.ts";
import { sameConsent } from "./selection.ts";
export function calendarReadScope(state: CalendarView | undefined) {
  if (!state?.loaded || state.stage !== "ready") return null;
  const { selection, consent } = state;
  if (!consent || selection?.status !== "active") return null;
  return sameConsent(selection.consent, consent) ? selection : null;
}
