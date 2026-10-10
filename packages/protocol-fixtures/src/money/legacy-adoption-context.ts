import type { AdoptionFormContext } from "./legacy-adoption-draft.ts";
import type { RecurringDraft } from "./recurring-draft.ts";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { LegacyAdoptionSaveView } from "./legacy-adoption-save-runtime.ts";
import type { ExpenseEntryOptions } from "./entry-options.ts";
export function adoptionRequestEnabled(view: LegacyAdoptionSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function currentAdoptionSource(read: RecurringReadView) {
  if (!read.active || !read.online || read.busy || read.verify) return null;
  if (read.target.kind !== "legacy-adoption" || read.entry?.kind !== "legacy-adoption") return null;
  return read.entry.value.review.rule.ruleId === read.target.ruleId ? read.entry.value : null;
}
export function adoptionFormContext(
  read: RecurringReadView,
  save: LegacyAdoptionSaveView,
  options: { value: ExpenseEntryOptions | null; fresh: boolean; verify: boolean },
) {
  if (!adoptionRequestEnabled(save) || save.attempt || save.result) return null;
  if (!options.fresh || options.verify || !options.value) return null;
  const source = currentAdoptionSource(read);
  return source ? { ...source, options: options.value } : null;
}
export function adoptionPreviewCurrent(
  expected: { context: AdoptionFormContext; serialized: string },
  current: {
    context: AdoptionFormContext | null;
    input: RecurringDraft;
    read: RecurringReadView;
    save: LegacyAdoptionSaveView;
  },
) {
  return (
    samePreviewContext(expected.context, current.context) &&
    currentAdoptionSource(current.read)?.review === expected.context.review &&
    JSON.stringify(current.input) === expected.serialized &&
    adoptionRequestEnabled(current.save) &&
    !current.save.attempt &&
    !current.save.result
  );
}

function samePreviewContext(expected: AdoptionFormContext, current: AdoptionFormContext | null) {
  return (
    current !== null &&
    current.review === expected.review &&
    current.options === expected.options &&
    current.today === expected.today
  );
}
