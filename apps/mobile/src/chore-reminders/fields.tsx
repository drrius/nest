import { ReminderNotificationSetup } from "../components/reminder-notification-setup";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label";
import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeReminderFields } from "./use-fields";
import type { ReminderEditorContext } from "./editor-context";
export function ReminderFieldsView({
  fields,
  context,
  disabled,
}: {
  fields: NativeReminderFields;
  context: ReminderEditorContext;
  disabled: boolean;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Section title="Reminder">
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Reminder</Text>
          <Picker
            selectedValue={fields.enabled ? "on" : "off"}
            enabled={!disabled}
            onValueChange={(value) => fields.setEnabled(value === "on")}
          >
            <Picker.Item label="Off" value="off" />
            <Picker.Item label="On" value="on" />
          </Picker>
          <Text>Days before</Text>
          <TextInput value={fields.daysBefore} keyboardType="number-pad" editable={!disabled} />
          <Text>Time (HH:MM, Europe/Zurich)</Text>
          <TextInput value={fields.localTime} editable={!disabled} />
        </Column>
      </Host>
      <Section title="Recipients">
        {context.members.map((member) => (
          <NativeAction
            key={member.actorId}
            label={`${fields.recipientIds.includes(member.actorId) ? "Selected: " : "Select: "}${reminderRecipientLabel(member, context.actorId)}`}
            disabled={disabled}
            onPress={() => fields.toggleRecipient(member.actorId)}
          />
        ))}
      </Section>
      <ReminderNotificationSetup disabled={disabled} />
    </Section>
  );
}
