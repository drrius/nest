import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import type { CorrectionContext } from "@nest/contracts/correction-context";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { NativeCorrectionDraft } from "./use-correction-draft";
import type { ExpenseEntryOptions } from "./entry-options";
import { ExpenseFields } from "./expense-fields";
interface Props {
  draft: NativeCorrectionDraft;
  context: CorrectionContext;
  options: ExpenseEntryOptions;
  disabled: boolean;
  next: () => void;
  first: () => void;
}
export function CorrectionFields(props: Props) {
  const { draft, context, disabled } = props,
    colors = useQuiet(),
    scheme = useColorScheme();
  if (!context.canReverse && !context.canReplace)
    return (
      <Note>
        {context.hasActiveRefunds
          ? "Reverse the active refunds before correcting their original expense."
          : "This retained entry cannot be corrected again. Open its replacement or related original entry."}
      </Note>
    );
  return (
    <>
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Correction</Text>
          <Picker selectedValue={draft.mode} onValueChange={draft.setMode} enabled={!disabled}>
            {context.canReplace ? (
              <Picker.Item label="Replace with corrected values" value="replace" />
            ) : null}
            {context.canReverse ? (
              <Picker.Item label="Reverse without replacement" value="reverse" />
            ) : null}
          </Picker>
        </Column>
      </Host>
      <CorrectionBody {...props} />
    </>
  );
}
function OpeningFields({ draft, options, disabled }: Props) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Section title="Replacement opening balance">
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Description</Text>
          <TextInput value={draft.description} editable={!disabled} />
          <Text>Opening amount in CHF</Text>
          <TextInput value={draft.amount} keyboardType="decimal-pad" editable={!disabled} />
          <Text>Credited to</Text>
          <Picker selectedValue={draft.payerId} onValueChange={draft.setPayer} enabled={!disabled}>
            {options.members.map((member) => (
              <Picker.Item key={member.actorId} label={member.displayName} value={member.actorId} />
            ))}
          </Picker>
          <Text>Note (optional)</Text>
          <TextInput value={draft.note} multiline editable={!disabled} />
        </Column>
      </Host>
      <DateTimePicker
        value={draft.date}
        mode="date"
        disabled={disabled}
        onChange={(_, date) => {
          if (date) draft.setDate(date);
        }}
      />
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label="Review and record correction"
        disabled={disabled}
        onPress={draft.submit}
      />
    </Section>
  );
}

function CorrectionBody(props: Props) {
  const { draft, context, disabled } = props;
  return (
    <>
      {draft.mode === "replace" && context.canReplace ? (
        context.source.event.kind === "opening_balance" ? (
          <OpeningFields {...props} />
        ) : (
          <ExpenseFields
            {...props}
            title="Replacement expense"
            reviewLabel="Review and record correction"
          />
        )
      ) : (
        <>
          <Note>
            A reversal cancels this entry's balance effect. Both entries remain in history.
          </Note>
          {draft.error ? <Note>{draft.error}</Note> : null}
          <NativeAction
            label="Review and record correction"
            disabled={disabled}
            onPress={draft.submit}
          />
        </>
      )}
    </>
  );
}
