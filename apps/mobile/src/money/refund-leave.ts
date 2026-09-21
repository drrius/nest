import type { RefundDraft } from "./refund-draft.ts";
import type { RefundSaveView } from "./refund-save-runtime.ts";
export function canLeaveRefund(
  initial: RefundDraft,
  current: RefundDraft,
  view: Pick<RefundSaveView, "result" | "attempt" | "busy">,
) {
  if (view.result?.status === "recorded") return true;
  if (view.attempt !== null || view.busy) return false;
  return Object.keys(initial).every(
    (key) => current[key as keyof RefundDraft] === initial[key as keyof RefundDraft],
  );
}
