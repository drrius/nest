import { Alert } from "react-native";
import { warningDecision } from "./warning-decision";
export type CalendarWarningKind = "chore" | "preparation";
export function confirmDayWarning(
  kind: CalendarWarningKind,
  result: "busy" | "unknown",
  signal: AbortSignal,
) {
  const subject = kind === "chore" ? "Chores" : "Preparation tasks";
  const message =
    result === "busy"
      ? `Your selected calendars have busy time on this date. ${subject} have no set time, so you can still choose this day.`
      : "Your selected calendar availability could not be checked. You can still choose this day.";
  return warningDecision(signal, (decide) =>
    Alert.alert(
      result === "busy" ? "Busy time on this day" : "Calendar availability unknown",
      `${message} This check covers your phone's selected calendars, not your partner's availability.`,
      [
        { text: "Choose another date", style: "cancel", onPress: () => decide(false) },
        {
          text: kind === "chore" ? "Reschedule anyway" : "Save anyway",
          onPress: () => decide(true),
        },
      ],
      { cancelable: true, onDismiss: () => decide(false) },
    ),
  );
}
