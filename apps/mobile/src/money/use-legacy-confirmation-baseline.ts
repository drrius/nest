import { useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { LegacyConfirmationContext } from "./legacy-confirmation-draft";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { LegacyConfirmationSaveRuntime } from "./legacy-confirmation-save-runtime";
import { currentDismissalDraft } from "./legacy-dismissal-confirmation";
import { legacyConfirmationRequestEnabled } from "./legacy-confirmation-context";
export function useLegacyConfirmationBaseline(
  current: LegacyConfirmationContext | null,
  read: RecurringReadRuntime,
  save: LegacyConfirmationSaveRuntime,
) {
  const [baseline, setBaseline] = useState<{
    context: LegacyConfirmationContext;
    revision: number;
  } | null>(null);
  if (!baseline && current) setBaseline({ context: current, revision: 0 });
  const latest = useRef(current);
  useLayoutEffect(() => {
    latest.current = current;
  });
  const reset = () => {
    const expected = current;
    if (!expected) return;
    Alert.alert(
      "Discard edits and review latest draft?",
      "This replaces unsaved expense fields with the retained draft values. Missing values still need your review.",
      [
        { text: "Keep edits", style: "cancel" },
        {
          text: "Reset form",
          style: "destructive",
          onPress: () => {
            const now = latest.current,
              view = save.getSnapshot();
            if (
              now?.review === expected.review &&
              now?.options === expected.options &&
              currentDismissalDraft(read.getSnapshot()) === expected.review &&
              legacyConfirmationRequestEnabled(view) &&
              !view.attempt &&
              !view.result
            )
              setBaseline((value) => ({ context: now, revision: (value?.revision ?? 0) + 1 }));
          },
        },
      ],
    );
  };
  return { baseline, reset };
}
