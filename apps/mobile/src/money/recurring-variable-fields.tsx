import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeVariableAmount } from "./use-variable-amount";
import type { ExpenseEntryOptions } from "./entry-options";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import { recurringStateSummary } from "./recurring-state-summary";
export function VariableAmountFields({
  draft,
  options,
  rule,
  actor,
}: {
  draft: NativeVariableAmount;
  options: ExpenseEntryOptions;
  rule: RecurringRule;
  actor: string;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Section title="Variable bill">
      <Note>{recurringStateSummary(rule, actor)}</Note>
      <Note>
        Confirm the amount and split for this cycle. The rule’s payer, category and note are
        retained.
      </Note>
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Amount in CHF</Text>
          <TextInput value={draft.amount} keyboardType="decimal-pad" placeholder="0.00" />
          <Text>Split</Text>
          <Picker selectedValue={draft.split} onValueChange={draft.setSplit}>
            <Picker.Item label="Equal" value="equal" />
            <Picker.Item label="Exact amounts" value="exact" />
            <Picker.Item label="Percentage" value="percentage" />
          </Picker>
          <VariableShares draft={draft} options={options} />
        </Column>
      </Host>
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction label="Review and record this cycle" onPress={draft.submit} />
    </Section>
  );
}
function VariableShares({
  draft,
  options,
}: {
  draft: NativeVariableAmount;
  options: ExpenseEntryOptions;
}) {
  if (draft.split === "exact")
    return (
      <>
        <Text>{`${options.members[0].displayName}’s share in CHF`}</Text>
        <TextInput value={draft.firstExact} keyboardType="decimal-pad" />
        <Text>{`${options.members[1].displayName}’s share in CHF`}</Text>
        <TextInput value={draft.secondExact} keyboardType="decimal-pad" />
      </>
    );
  if (draft.split === "percentage")
    return (
      <>
        <Text>{`${options.members[0].displayName}’s percentage (0–100)`}</Text>
        <TextInput value={draft.firstPercent} keyboardType="decimal-pad" />
        <Text>{`${options.members[1].displayName} receives the remaining percentage.`}</Text>
      </>
    );
  return <Text>Split equally. Any odd centime belongs to the payer’s share.</Text>;
}
