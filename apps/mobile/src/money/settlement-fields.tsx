import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import type { MoneyBalance } from "@nest/contracts/money";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeSettlementDraft } from "./use-settlement-draft";
import { settlementBalance } from "./settlement-draft";
import { formatChf } from "./format";
export function SettlementFields({
  draft,
  balance,
  disabled,
}: {
  draft: NativeSettlementDraft;
  balance: typeof MoneyBalance.Type;
  disabled: boolean;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme(),
    pair = settlementBalance(balance);
  if (!pair) return <Note>Your household balance is settled. There is nothing to record.</Note>;
  return (
    <Section title="Settlement">
      <Note>
        {pair.payer.displayName} owes {pair.recipient.displayName} {formatChf(pair.outstanding)}.
      </Note>
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Description</Text>
          <TextInput value={draft.description} editable={!disabled} />
          <Text>Amount to record</Text>
          <Picker selectedValue={draft.mode} onValueChange={draft.setMode} enabled={!disabled}>
            <Picker.Item label={`Full · ${formatChf(pair.outstanding)}`} value="full" />
            <Picker.Item label="Partial amount" value="partial" />
          </Picker>
          {draft.mode === "partial" ? (
            <>
              <Text>Amount in CHF</Text>
              <TextInput
                value={draft.amount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={!disabled}
              />
            </>
          ) : null}
          <Text>Note (optional)</Text>
          <TextInput value={draft.note} multiline editable={!disabled} />
        </Column>
      </Host>
      <Section title="Payment date">
        <DateTimePicker
          value={draft.date}
          mode="date"
          disabled={disabled}
          onChange={(_, value) => {
            if (value) draft.setDate(value);
          }}
        />
      </Section>
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label="Review and record settlement"
        disabled={disabled}
        onPress={draft.submit}
      />
    </Section>
  );
}
