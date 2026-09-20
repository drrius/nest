import { Host, Column, Switch } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { NotificationRuntime, NotificationView } from "../notifications/runtime";
import { useNotificationDraft } from "../notifications/use-draft";
import { pickerTime } from "../notifications/time";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
export function NotificationFields({
  runtime,
  view,
}: {
  runtime: NotificationRuntime;
  view: NotificationView;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  const { draft, setTime, setDaily, setItems, submit } = useNotificationDraft(runtime, view);
  const editable = !view.busy && view.stage === "form";
  return (
    <Card>
      <Section title="Your notifications" />
      <Note>
        These choices apply only to you. Muting item reminders also mutes reminders your partner
        addresses to you.
      </Note>
      {!view.profile ? (
        <Note>You have not saved a notification choice yet. Both options start off.</Note>
      ) : null}
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Switch
            label="Daily summary"
            value={draft.dailySummaryEnabled}
            disabled={!editable}
            onValueChange={setDaily}
          />
          <Switch
            label="Item reminders"
            value={draft.itemRemindersEnabled}
            disabled={!editable}
            onValueChange={setItems}
          />
        </Column>
      </Host>
      <Note>Daily summary time · Europe/Zurich · {draft.dailySummaryTime}</Note>
      <DateTimePicker
        value={pickerTime(draft.dailySummaryTime)}
        mode="time"
        display="compact"
        timeZoneName="UTC"
        disabled={!editable}
        themeVariant={scheme === "dark" ? "dark" : "light"}
        accentColor={colors.accent}
        onValueChange={(_event, date) => setTime(date)}
      />
      <Note>
        Saving these choices does not grant iPhone permission. Notification delivery is not
        connected in this development build.
      </Note>
      <NativeAction
        label={view.busy ? "Working…" : "Save your preferences"}
        disabled={!editable}
        onPress={submit}
      />
    </Card>
  );
}
