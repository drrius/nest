import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { LegacyDismissalSaveRuntime } from "./legacy-dismissal-save-runtime";
import {
  currentDismissalDraft,
  dismissalContext,
  prepareDismissal,
  dismissalConfirmationCurrent,
  dismissalText,
} from "./legacy-dismissal-confirmation";
export interface DismissalRuntimes {
  read: RecurringReadRuntime;
  save: LegacyDismissalSaveRuntime;
}
export function DismissalReview({ read, save, actor }: DismissalRuntimes & { actor: string }) {
  const current = () => dismissalContext(read.getSnapshot(), save.getSnapshot());
  const context = current();
  if (!context) return <DismissalAvailability read={read} />;
  const review = () => {
    const loaded = current();
    if (!loaded) return;
    const expected = prepareDismissal(loaded, randomUUID());
    Alert.alert("Dismiss this draft?", dismissalText(expected.context, actor), [
      { text: "Keep draft", style: "cancel" },
      {
        text: "Dismiss draft",
        style: "destructive",
        onPress: () => {
          if (dismissalConfirmationCurrent(expected, current())) void save.save(expected.command);
          else Alert.alert("Review changed", "Reload and review this draft before dismissing it.");
        },
      },
    ]);
  };
  return (
    <Section title="Review retained draft">
      <Note>{dismissalText(context, actor)}</Note>
      <NativeAction label="Review and dismiss draft" onPress={review} />
    </Section>
  );
}
export function useLeaveDismissal(save: LegacyDismissalSaveRuntime) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const view = save.getSnapshot();
    if (!view.busy && !view.attempt) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this dismissal request?",
      "It may already have dismissed the draft. Leaving does not cancel it. Reopen draft dismissal to check the saved request.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}

function DismissalAvailability({ read }: { read: RecurringReadRuntime }) {
  const context = currentDismissalDraft(read.getSnapshot());
  return (
    <Note>
      {context
        ? `Current draft status: ${context.draft.status}. Only pending recurring drafts without a linked financial event can be dismissed. Resolve any earlier request first.`
        : "Load the current draft online to review its dismissal status."}
    </Note>
  );
}
