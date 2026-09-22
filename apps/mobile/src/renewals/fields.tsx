import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeRenewalFields } from "./use-fields";
import type { RenewalEditorContext } from "./editor-context";
type Props = {
  fields: NativeRenewalFields;
  context: RenewalEditorContext;
  disabled: boolean;
  next: () => void;
  first: () => void;
};
export function RenewalFieldsView({ fields, context, disabled, next, first }: Props) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Section title="Renewal">
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Title</Text>
          <TextInput value={fields.title} editable={!disabled} />
          <Text>Cancellation notice in days</Text>
          <TextInput value={fields.noticeDays} keyboardType="number-pad" editable={!disabled} />
          <Text>Responsible member</Text>
          <Picker
            selectedValue={fields.responsibleId ?? ""}
            enabled={!disabled}
            onValueChange={(value) => fields.setResponsibleId(value || null)}
          >
            <Picker.Item label="Unassigned" value="" />
            {context.members.map((member) => (
              <Picker.Item key={member.actorId} label={member.displayName} value={member.actorId} />
            ))}
          </Picker>
        </Column>
      </Host>
      <Section title="Renewal date">
        <DateTimePicker
          value={fields.date}
          mode="date"
          disabled={disabled}
          onChange={(_, date) => {
            if (date) fields.setDate(date);
          }}
        />
      </Section>
      <Note>
        Linked expense:{" "}
        {fields.recurringRuleId
          ? (fields.linked?.title ??
            context.linked?.rule.configuration.description ??
            "Selection unavailable; reload before saving.")
          : "None"}
      </Note>
      <NativeAction
        label="No linked recurring expense"
        disabled={disabled}
        onPress={() => fields.selectRule(null)}
      />
      {context.rules.rules.map((rule) => (
        <NativeAction
          key={rule.ruleId}
          label={`Link ${rule.configuration.description}`}
          disabled={disabled}
          onPress={() =>
            fields.selectRule({ ruleId: rule.ruleId, title: rule.configuration.description })
          }
        />
      ))}
      {context.rules.next ? (
        <NativeAction label="More recurring expenses" disabled={disabled} onPress={next} />
      ) : null}
      {context.rules.after ? (
        <NativeAction label="First recurring expenses" disabled={disabled} onPress={first} />
      ) : null}
    </Section>
  );
}
