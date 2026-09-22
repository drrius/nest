import { useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { AdoptionFormContext } from "./legacy-adoption-draft";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { LegacyAdoptionSaveRuntime } from "./legacy-adoption-save-runtime";
import { currentAdoptionSource } from "./legacy-adoption-context";
import { adoptionRequestEnabled } from "./legacy-adoption-context";
export function useLegacyAdoptionBaseline(
  current: AdoptionFormContext | null,
  read: RecurringReadRuntime,
  save: LegacyAdoptionSaveRuntime,
) {
  const [baseline, setBaseline] = useState<{
    context: AdoptionFormContext;
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
      "Discard edits and review latest rule?",
      "This replaces unsaved configuration fields with the retained rule values. Missing values still need your review.",
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
              currentAdoptionSource(read.getSnapshot())?.review === expected.review &&
              adoptionRequestEnabled(view) &&
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
