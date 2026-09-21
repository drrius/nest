import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { VariableCycleSaveRuntime } from "./recurring-variable-save-runtime";
import type { ExpenseEntryOptions } from "./entry-options";
import type { VariableAmountDraft } from "./recurring-variable-draft";
import {
  prepareVariableConfirmation,
  variableConfirmationCurrent,
  variableConfirmationText,
} from "./recurring-variable-confirmation";
export function useVariableAmount(
  read: RecurringReadRuntime,
  save: VariableCycleSaveRuntime,
  options: ExpenseEntryOptions | null,
) {
  const amount = useNativeState(""),
    firstExact = useNativeState(""),
    secondExact = useNativeState(""),
    firstPercent = useNativeState("50");
  const [split, setSplit] = useState<VariableAmountDraft["split"]>("equal");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!options) return;
    const expected = prepareVariableConfirmation(
      { read: read.getSnapshot(), save: save.getSnapshot() },
      {
        amount: amount.value,
        firstExact: firstExact.value,
        secondExact: secondExact.value,
        firstPercent: firstPercent.value,
        split,
      },
      options.members,
      Crypto.randomUUID(),
    );
    if (!expected.ok) return setError(expected.message);
    setError(null);
    Alert.alert("Record this variable bill?", variableConfirmationText(expected, options), [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Record expense",
        onPress: () => {
          if (variableConfirmationCurrent(expected, read.getSnapshot(), save.getSnapshot()))
            void save.save(expected.command);
          else setError("The reviewed rule is no longer current. Reload and review again.");
        },
      },
    ]);
  };
  return { amount, firstExact, secondExact, firstPercent, split, setSplit, error, submit };
}
export type NativeVariableAmount = ReturnType<typeof useVariableAmount>;
