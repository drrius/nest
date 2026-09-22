import type { LegacyConfirmationContext } from "./legacy-confirmation-draft.ts";
import type { ExpenseDraft } from "./expense-draft.ts";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { LegacyConfirmationSaveView } from "./legacy-confirmation-save-runtime.ts";
import { currentDismissalDraft } from "./legacy-dismissal-confirmation.ts";
import type { ExpenseEntryOptions } from "./entry-options.ts";
export function legacyConfirmationRequestEnabled(view: LegacyConfirmationSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function legacyConfirmationContext(
  read: RecurringReadView,
  save: LegacyConfirmationSaveView,
  options: { value: ExpenseEntryOptions | null; fresh: boolean; verify: boolean },
) {
  if (!legacyConfirmationRequestEnabled(save) || save.attempt || save.result) return null;
  if (!options.fresh || options.verify || !options.value) return null;
  const review = currentDismissalDraft(read);
  return review ? { review, options: options.value } : null;
}
export function legacyConfirmationPreviewCurrent(
  expected: {
    context: LegacyConfirmationContext;
    serialized: string;
  },
  current: {
    context: LegacyConfirmationContext | null;
    input: ExpenseDraft;
    read: RecurringReadView;
    save: LegacyConfirmationSaveView;
  },
) {
  return (
    current.context?.review === expected.context.review &&
    current.context?.options === expected.context.options &&
    currentDismissalDraft(current.read) === expected.context.review &&
    JSON.stringify(current.input) === expected.serialized &&
    legacyConfirmationRequestEnabled(current.save) &&
    !current.save.attempt &&
    !current.save.result
  );
}
