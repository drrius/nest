import { Host, Column, Text, Picker } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { ExpenseFields } from "./expense-fields";
import type { NativeRecurringDraft } from "./use-recurring-draft";
import type { ExpenseEntryOptions } from "./entry-options";
export function RecurringFields(props: {
  draft: NativeRecurringDraft;
  options: ExpenseEntryOptions;
  disabled: boolean;
  next: () => void;
  first: () => void;
}) {
  const { draft, disabled } = props,
    colors = useQuiet(),
    scheme = useColorScheme();
  const days = Array.from({ length: draft.cadence === "weekly" ? 7 : 31 }, (_, index) =>
    String(index + 1),
  );
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <>
      <Section title="Recurring schedule">
        <Host
          matchContents
          seedColor={colors.accent}
          colorScheme={scheme === "dark" ? "dark" : "light"}
        >
          <Column spacing={12}>
            <Text>Mode</Text>
            <Picker selectedValue={draft.mode} onValueChange={draft.setMode} enabled={!disabled}>
              <Picker.Item label="Variable — confirm each cycle" value="variable" />
              <Picker.Item label="Fixed — authorize exact configuration" value="fixed" />
            </Picker>
            <Text>Repeat</Text>
            <Picker
              selectedValue={draft.cadence}
              enabled={!disabled}
              onValueChange={(value) => {
                draft.setCadence(value);
                draft.setDay("1");
              }}
            >
              <Picker.Item label="Weekly" value="weekly" />
              <Picker.Item label="Monthly" value="monthly" />
            </Picker>
            <Text>Due day</Text>
            <Picker selectedValue={draft.day} onValueChange={draft.setDay} enabled={!disabled}>
              {days.map((day) => (
                <Picker.Item
                  key={day}
                  value={day}
                  label={draft.cadence === "weekly" ? weekdays[Number(day) - 1]! : day}
                />
              ))}
            </Picker>
          </Column>
        </Host>
        <Note>
          The date below is the prospective start. Short months use their last day. Earlier cycles
          are not backfilled.
        </Note>
        {draft.mode === "variable" ? (
          <Note>Each cycle needs its own confirmed amount and split.</Note>
        ) : null}
        <Note>
          Scheduled posting is not active yet. Saving configures a rule; it does not create an
          expense.
        </Note>
      </Section>
      <ExpenseFields
        {...props}
        variable={draft.mode === "variable"}
        dateLabel="Prospective start"
        payerLabel="Payer"
        title="Recurring configuration"
        reviewLabel="Review and save configuration"
      />
    </>
  );
}
