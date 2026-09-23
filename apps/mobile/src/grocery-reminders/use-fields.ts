import { useNativeState } from "@expo/ui";
import { useState } from "react";
import type { ReminderDraft } from "./form";
export function useReminderFields(initial: ReminderDraft) {
  const localTime = useNativeState(initial.localTime),
    localDate = useNativeState(initial.localDate);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipientIds, setRecipientIds] = useState(initial.recipientIds);
  return {
    localTime,
    localDate,
    enabled,
    setEnabled,
    recipientIds,
    toggleRecipient: (id: string) =>
      setRecipientIds((ids) =>
        ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
      ),
    read: (): ReminderDraft => ({
      localTime: localTime.value,
      localDate: localDate.value,
      enabled,
      recipientIds,
    }),
  };
}
export type NativeReminderFields = ReturnType<typeof useReminderFields>;
