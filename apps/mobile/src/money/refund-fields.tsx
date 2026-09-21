import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import type { RefundContext } from "@nest/contracts/refund";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeRefundDraft } from "./use-refund-draft";
import { formatChf } from "./format";
export function RefundFields({
  draft,
  balance,
  disabled,
  actor,
}: {
  draft: NativeRefundDraft;
  balance: typeof RefundContext.Type;
  disabled: boolean;
  actor: string;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  if (!balance.refundable)
    return <Note>This expense has no remaining refundable shares or has been reversed.</Note>;
  return (
    <Section title="Refund">
      <Note>For: {balance.source.event.description}</Note>
      {balance.remaining.map((share) => (
        <Note key={share.memberId}>
          {share.memberId === actor ? "Your" : "Partner's"} remaining share:{" "}
          {formatChf(share.centimes)}
        </Note>
      ))}
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
            <Picker.Item label="All remaining shares" value="full" />
            <Picker.Item label="Partial amount" value="partial" />
          </Picker>
          {draft.mode === "partial" ? (
            <>
              <Text>Your refunded share in CHF</Text>
              <TextInput
                value={draft.own}
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={!disabled}
              />
              <Text>Your partner's refunded share in CHF</Text>
              <TextInput
                value={draft.partner}
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
      <Section title="Refund date">
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
      <NativeAction label="Review and record refund" disabled={disabled} onPress={draft.submit} />
    </Section>
  );
}
