import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { NotificationRuntime, NotificationView } from "./runtime";
import { summaryTime } from "./time";
export function useNotificationDraft(runtime: NotificationRuntime, view: NotificationView) {
  const initial = view.profile?.preferences ?? {
    dailySummaryEnabled: false,
    dailySummaryTime: "08:00",
    itemRemindersEnabled: false,
  };
  const [draft, setDraft] = useState(initial);
  const navigation = useNavigation();
  const dirty =
    draft.dailySummaryEnabled !== initial.dailySummaryEnabled ||
    draft.dailySummaryTime !== initial.dailySummaryTime ||
    draft.itemRemindersEnabled !== initial.itemRemindersEnabled;
  usePreventRemove(true, ({ data }) => {
    if (!dirty && !view.busy && view.stage === "form") return navigation.dispatch(data.action);
    Alert.alert(
      "Leave notification preferences?",
      "Unsaved input and retry details will be lost. A save already sent may still finish. Reopening loads your saved preferences.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const setTime = (date: Date) => {
    const time = summaryTime(date);
    if (time !== null) setDraft((value) => ({ ...value, dailySummaryTime: time }));
  };
  return {
    draft,
    setTime,
    setDaily: (enabled: boolean) =>
      setDraft((value) => ({ ...value, dailySummaryEnabled: enabled })),
    setItems: (enabled: boolean) =>
      setDraft((value) => ({ ...value, itemRemindersEnabled: enabled })),
    submit: () => {
      void runtime.save(draft);
    },
  };
}
