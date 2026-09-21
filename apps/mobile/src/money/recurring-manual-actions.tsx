import { Alert } from "react-native";
import { randomUUID } from "expo-crypto";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { MoneyReadRuntime } from "./read-runtime";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { ManualCycleSaveRuntime } from "./recurring-manual-save-runtime";
import {
  manualContext,
  prepareManualConfirmation,
  manualConfirmationCurrent,
  manualConfirmationText,
} from "./recurring-manual-confirmation";
export interface ManualRuntimes {
  source: MoneyReadRuntime;
  rule: RecurringReadRuntime;
  save: ManualCycleSaveRuntime;
}
export function ManualReview({ runtimes, actor }: { runtimes: ManualRuntimes; actor: string }) {
  const current = () =>
    manualContext(
      runtimes.source.getSnapshot(),
      runtimes.rule.getSnapshot(),
      runtimes.save.getSnapshot(),
    );
  const context = current();
  if (!context)
    return (
      <Note>
        Load an active due rule and an unreversed expense in the same period online. An expense
        already linked to a cycle cannot be linked again.
      </Note>
    );
  const review = () => {
    const loaded = current();
    if (!loaded) return;
    const expected = prepareManualConfirmation(loaded, randomUUID());
    Alert.alert("Link this existing expense?", manualConfirmationText(expected, actor), [
      { text: "Keep reviewing", style: "cancel" },
      {
        text: "Link expense",
        onPress: () => {
          if (manualConfirmationCurrent(expected, current()))
            void runtimes.save.save(expected.command);
          else
            Alert.alert(
              "Review changed",
              "Reload and review the current expense and rule before linking.",
            );
        },
      },
    ]);
  };
  return (
    <Section title="Review existing expense and cycle">
      <Note>
        {manualConfirmationText(
          prepareManualConfirmation(context, context.target.rule.ruleId),
          actor,
        )}
      </Note>
      <NativeAction label="Review and link this expense" onPress={review} />
    </Section>
  );
}
export function useLeaveManual(save: ManualCycleSaveRuntime) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    const view = save.getSnapshot();
    if (!view.busy && !view.attempt) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this linking request?",
      "It may already have linked the expense. Leaving does not cancel it. Reopen linking from Money history to check the saved request.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}
