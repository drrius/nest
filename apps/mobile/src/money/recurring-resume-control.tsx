import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import { NativeAction } from "../components/native-action";
import { Note } from "../components/page";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type { RecurringStateSaveRuntime } from "./recurring-state-save-runtime";
import { currentStateRule, stateConfirmationCurrent } from "./recurring-state-confirmation";
import { prepareRecurringResume, resumeConfirmationText } from "./recurring-resume-confirmation";
export function RecurringResumeControl({
  read,
  save,
  actor,
}: {
  read: RecurringReadRuntime;
  save: RecurringStateSaveRuntime;
  actor: string;
}) {
  const snapshot = read.getSnapshot(),
    rule = currentStateRule(snapshot, save.getSnapshot());
  if (!rule || rule.status !== "paused" || snapshot.entry?.kind !== "detail") return null;
  const expected = prepareRecurringResume(rule, snapshot.entry.value.today, Crypto.randomUUID());
  if (!expected) return <Note>No prospective cycle is available for this rule.</Note>;
  return (
    <NativeAction
      label="Resume recurring rule"
      onPress={() =>
        Alert.alert("Authorize resumption?", resumeConfirmationText(expected, actor), [
          { text: "Keep paused", style: "cancel" },
          {
            text: "Authorize and resume",
            onPress: () => {
              if (stateConfirmationCurrent(expected, read.getSnapshot(), save.getSnapshot()))
                void save.save(expected.command);
            },
          },
        ])
      }
    />
  );
}
