import type { CorrectionDraft } from "./correction-draft.ts";
import type { CorrectionSaveView } from "./correction-save-runtime.ts";
export function canLeaveCorrection(
  initial: CorrectionDraft,
  current: CorrectionDraft,
  view: Pick<CorrectionSaveView, "result" | "attempt" | "busy">,
) {
  if (view.result?.status === "recorded") return true;
  if (view.attempt !== null || view.busy) return false;
  return Object.keys(initial).every(
    (key) => current[key as keyof CorrectionDraft] === initial[key as keyof CorrectionDraft],
  );
}
