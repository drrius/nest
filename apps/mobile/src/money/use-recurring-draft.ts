import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import {
  editRecurringDraft,
  initialRecurringDraft,
  type RecurringDraftContext,
} from "./recurring-draft";
import { useRecurringFields } from "./use-recurring-fields";
import {
  prepareRecurringConfirmation,
  recurringConfirmationGuard,
  recurringConfirmationText,
  recurringEntryEnabled,
} from "./recurring-confirmation";
import type { RecurringSaveRuntime } from "./recurring-save-runtime";
export function useRecurringDraft(
  initialContext: RecurringDraftContext,
  current: RecurringDraftContext | null,
  runtime: RecurringSaveRuntime,
  actor: string,
) {
  const [initial] = useState(() =>
    initialContext.current
      ? editRecurringDraft(initialContext)
      : initialRecurringDraft(actor, initialContext.today),
  );
  const fields = useRecurringFields(initial);
  const [operationId, setOperationId] = useState(Crypto.randomUUID),
    [error, setError] = useState<string | null>(null);
  const [guard] = useState(recurringConfirmationGuard);
  const latest = useRef({ current, read: fields.read });
  useLayoutEffect(() => {
    latest.current = { current, read: fields.read };
  });
  useEffect(() => {
    guard.invalidate();
  }, [guard, current]);
  useEffect(() => {
    const stop = runtime.subscribe(guard.invalidate);
    return () => {
      stop();
      guard.invalidate();
    };
  }, [runtime, guard]);
  useLeaveRecurring(initial, fields.read, runtime, guard.invalidate);
  const submit = () => {
    if (!current || !recurringEntryEnabled(runtime.getSnapshot())) return;
    const input = fields.read(),
      parsed = prepareRecurringConfirmation(input, current, initialContext, operationId);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const preview = guard.prepare(parsed.command),
      serialized = JSON.stringify(input);
    Alert.alert(
      "Save recurring configuration?",
      recurringConfirmationText(preview.command, actor),
      [
        { text: "Cancel", style: "cancel", onPress: guard.invalidate },
        {
          text: "Save configuration",
          onPress: () => {
            if (
              latest.current.current !== current ||
              JSON.stringify(latest.current.read()) !== serialized ||
              !recurringEntryEnabled(runtime.getSnapshot()) ||
              !preview.consume()
            )
              return setError("The form or connection changed. Review the configuration again.");
            void runtime.save(preview.command);
          },
        },
      ],
    );
  };
  const nextExpense = () => {
    guard.invalidate();
    setOperationId(Crypto.randomUUID());
    setError(null);
    runtime.acknowledge();
  };
  return { ...fields, error, submit, nextExpense };
}
export type NativeRecurringDraft = ReturnType<typeof useRecurringDraft>;

function useLeaveRecurring(
  initial: ReturnType<typeof initialRecurringDraft>,
  read: () => ReturnType<typeof initialRecurringDraft>,
  runtime: RecurringSaveRuntime,
  invalidate: () => void,
) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    invalidate();
    const view = runtime.getSnapshot();
    if (
      view.result?.status === "recorded" ||
      (!view.busy && !view.attempt && JSON.stringify(read()) === JSON.stringify(initial))
    )
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave recurring setup?",
      "Unsaved input will be lost. Leaving does not cancel a Save already sent; its outcome remains available for recovery.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
