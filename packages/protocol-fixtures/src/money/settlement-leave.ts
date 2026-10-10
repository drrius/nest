import type { SettlementDraft } from "./settlement-draft.ts";
import type { SettlementSaveView } from "./settlement-save-runtime.ts";
export function canLeaveSettlement(
  initial: SettlementDraft,
  current: SettlementDraft,
  view: Pick<SettlementSaveView, "result" | "attempt" | "busy">,
) {
  if (view.result?.status === "recorded") return true;
  if (view.attempt !== null || view.busy) return false;
  return Object.keys(initial).every(
    (key) => current[key as keyof SettlementDraft] === initial[key as keyof SettlementDraft],
  );
}
