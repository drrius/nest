import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { LegacyConfirmationSaveRuntime } from "./legacy-confirmation-save-runtime";
import { useExpenseFields } from "./use-expense-fields";
import {
  initialLegacyConfirmation,
  prepareLegacyConfirmation,
  legacyConfirmationGuard,
  type LegacyConfirmationContext,
} from "./legacy-confirmation-draft";
import {
  legacyConfirmationRequestEnabled,
  legacyConfirmationPreviewCurrent,
} from "./legacy-confirmation-context";
import { expenseReview } from "./expense-review";
import { useLeaveLegacyConfirmation } from "./use-leave-legacy-confirmation";
export interface ConfirmationFormProps {
  initial: LegacyConfirmationContext;
  current: LegacyConfirmationContext | null;
  read: RecurringReadRuntime;
  save: LegacyConfirmationSaveRuntime;
}
export function useLegacyConfirmationDraft(props: ConfirmationFormProps) {
  const [initial] = useState(() => initialLegacyConfirmation(props.initial));
  const category = initial.categoryId
    ? { categoryId: initial.categoryId, name: "Retained category (review)" }
    : null;
  const fields = useExpenseFields(initial, category);
  const [dateChosen, chooseDate] = useState(Boolean(initial.date));
  const read = () => ({ ...fields.read(), date: dateChosen ? fields.read().date : "" });
  const [operationId] = useState(randomUUID),
    [error, setError] = useState<string | null>(null);
  const guard = useConfirmationGuard(props);
  const latest = useRef({ props, read });
  useLayoutEffect(() => {
    latest.current = { props, read };
  });
  useLeaveLegacyConfirmation(
    props.save,
    () => JSON.stringify(read()) !== JSON.stringify(initial),
    guard.invalidate,
  );
  const submit = () => {
    const current = props.current;
    if (!current || !legacyConfirmationRequestEnabled(props.save.getSnapshot())) return;
    const input = read(),
      parsed = prepareLegacyConfirmation(input, current, props.initial, operationId);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const preview = guard.prepare(parsed.command),
      serialized = JSON.stringify(input);
    Alert.alert(
      "Confirm draft and record expense?",
      `${expenseReview(preview.command.input.expense, current.options.members)}\n\nNote: ${preview.command.input.expense.note ?? "None"}\nCategory: ${fields.category?.name ?? "None"}\n\nThe original draft stays in history. This records one expense; it does not authorize future automatic expenses.`,
      [
        { text: "Cancel", style: "cancel", onPress: guard.invalidate },
        {
          text: "Record expense",
          onPress: () => {
            const now = latest.current;
            if (
              !legacyConfirmationPreviewCurrent(
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
              return setError("The form, draft or connection changed. Review the expense again.");
            void props.save.save(preview.command);
          },
        },
      ],
    );
  };
  return {
    ...fields,
    dateChosen,
    error,
    submit,
    nextExpense: guard.invalidate,
    setDate: (date: Parameters<typeof fields.setDate>[0]) => {
      guard.invalidate();
      fields.setDate(date);
      chooseDate(true);
    },
    confirmDate: () => {
      guard.invalidate();
      chooseDate(true);
    },
  };
}

function useConfirmationGuard(props: ConfirmationFormProps) {
  const [guard] = useState(legacyConfirmationGuard);
  useEffect(() => {
    guard.invalidate();
  }, [guard, props.current?.review, props.current?.options]);
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
