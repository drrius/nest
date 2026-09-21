import { useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { CorrectionContext } from "@nest/contracts/correction-context";
import type { CorrectionSaveRuntime } from "./correction-save-runtime";
import {
  initialCorrectionDraft,
  parseCorrectionDraft,
  type CorrectionDraft,
} from "./correction-draft";
import { useCorrectionFields } from "./use-correction-fields";
import { useLeaveCorrection } from "./use-leave-correction";
import { correctionReview } from "./correction-review";
export function useCorrectionDraft(
  initialContext: CorrectionContext,
  current: CorrectionContext | null,
  runtime: CorrectionSaveRuntime,
  options: { actor: string; reload: () => void },
) {
  const [initial] = useState(() => initialCorrectionDraft(initialContext));
  const fields = useCorrectionFields(initial, initialContext);
  const [mode, setMode] = useState<CorrectionDraft["mode"]>(initial.mode);
  const [operationId, setOperationId] = useState(Crypto.randomUUID),
    [error, setError] = useState<string | null>(null);
  const read = () => ({ ...fields.read(), mode });
  useLeaveCorrection(initial, read, runtime);
  const submit = () => {
    if (!current) return setError("Load current history before reviewing a correction.");
    const parsed = parseCorrectionDraft(read(), current, options.actor);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const correction = parsed.correction;
    Alert.alert("Record this correction?", correctionReview(correction, current, options.actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Record correction", onPress: () => void runtime.save({ operationId, correction }) },
    ]);
  };
  const nextCorrection = () => {
    setOperationId(Crypto.randomUUID());
    setError(null);
    options.reload();
    runtime.acknowledge();
  };
  return { ...fields, mode, setMode, error, submit, nextCorrection, nextExpense: nextCorrection };
}
export type NativeCorrectionDraft = ReturnType<typeof useCorrectionDraft>;
