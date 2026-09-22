import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { LegacyAdoptionSaveRuntime } from "./legacy-adoption-save-runtime";
import { useRecurringFields } from "./use-recurring-fields";
import {
  initialLegacyAdoption,
  prepareLegacyAdoption,
  legacyAdoptionGuard,
  type AdoptionFormContext,
} from "./legacy-adoption-draft";
import { adoptionRequestEnabled, adoptionPreviewCurrent } from "./legacy-adoption-context";
import { adoptionReviewText } from "./legacy-adoption-summary";
import { useLeaveLegacyAdoption } from "./use-leave-legacy-adoption";
export interface AdoptionFormProps {
  initial: AdoptionFormContext;
  current: AdoptionFormContext | null;
  read: RecurringReadRuntime;
  save: LegacyAdoptionSaveRuntime;
  actor: string;
}
export function useLegacyAdoptionDraft(props: AdoptionFormProps) {
  const [initial] = useState(() => initialLegacyAdoption(props.initial));
  const fields = useRecurringFields(
    initial,
    props.initial.category?.name ?? "Unavailable retained category",
  );
  const [operationId] = useState(randomUUID),
    [error, setError] = useState<string | null>(null);
  const guard = useAdoptionGuard(props);
  const latest = useRef({ props, read: fields.read });
  useLayoutEffect(() => {
    latest.current = { props, read: fields.read };
  });
  useLeaveLegacyAdoption(
    props.save,
    () => JSON.stringify(fields.read()) !== JSON.stringify(initial),
    guard.invalidate,
  );
  const submit = () => {
    const current = props.current;
    if (!current || !adoptionRequestEnabled(props.save.getSnapshot())) return;
    const input = fields.read(),
      parsed = prepareLegacyAdoption(input, current, props.initial, operationId);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const preview = guard.prepare(parsed.command),
      serialized = JSON.stringify(input);
    Alert.alert(
      "Adopt this recurring rule?",
      `${adoptionReviewText(preview.command, props.actor, current)}\n\nCategory: ${fields.category?.name ?? "None"}`,
      [
        { text: "Cancel", style: "cancel", onPress: guard.invalidate },
        {
          text: "Adopt reviewed configuration",
          onPress: () => {
            const now = latest.current;
            if (
              !adoptionPreviewCurrent(
                { context: current, serialized },
                {
                  context: now.props.current,
                  input: now.read(),
                  read: props.read.getSnapshot(),
                  save: props.save.getSnapshot(),
                },
              ) ||
              !preview.consume()
            )
              return setError("The form, source or connection changed. Review the adoption again.");
            void props.save.save(preview.command);
          },
        },
      ],
    );
  };
  return { ...fields, error, submit, nextExpense: guard.invalidate };
}
function useAdoptionGuard(props: AdoptionFormProps) {
  const [guard] = useState(legacyAdoptionGuard);
  useEffect(() => {
    guard.invalidate();
  }, [guard, props.current?.review, props.current?.options, props.current?.today]);
  useEffect(() => {
    const stopSave = props.save.subscribe(guard.invalidate),
      stopRead = props.read.subscribe(guard.invalidate);
    return () => {
      stopSave();
      stopRead();
      guard.invalidate();
    };
  }, [props.save, props.read, guard]);
  return guard;
}
