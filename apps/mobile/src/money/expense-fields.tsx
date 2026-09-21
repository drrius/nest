import { ExpenseAmountFields } from "./expense-amount-fields";
import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ExpenseEntryOptions } from "./entry-options";
import type { NativeExpenseDraft } from "./use-expense-draft";
interface Props {
  draft: NativeExpenseDraft;
  options: ExpenseEntryOptions;
  disabled: boolean;
  next: () => void;
  first: () => void;
}
export function ExpenseFields(props: Props) {
  const { draft, options, disabled } = props,
    colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Section title="Expense">
      <Host
        matchContents
        seedColor={colors.accent}
        colorScheme={scheme === "dark" ? "dark" : "light"}
      >
        <Column spacing={12}>
          <Text>Description</Text>
          <TextInput
            value={draft.description}
            placeholder="What was it for?"
            editable={!disabled}
          />
          <ExpenseAmountFields draft={draft} disabled={disabled} />
          <Text>Paid by</Text>
          <Picker selectedValue={draft.payerId} onValueChange={draft.setPayer} enabled={!disabled}>
            {options.members.map((member) => (
              <Picker.Item key={member.actorId} label={member.displayName} value={member.actorId} />
            ))}
          </Picker>
          <Text>Split</Text>
          <Picker selectedValue={draft.split} onValueChange={draft.setSplit} enabled={!disabled}>
            <Picker.Item label="Equal" value="equal" />
            <Picker.Item label="Exact amounts" value="exact" />
            <Picker.Item label="Percentage" value="percentage" />
          </Picker>
          <SplitFields {...props} />
          <Text>Note (optional)</Text>
          <TextInput value={draft.note} multiline editable={!disabled} />
          <CategoryFields {...props} />
        </Column>
      </Host>
      <Section title="Date">
        <DateTimePicker
          value={draft.date}
          mode="date"
          disabled={disabled}
          onChange={(_, date) => {
            if (date) draft.setDate(date);
          }}
        />
      </Section>
      <CategoryPages {...props} />
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction label="Review and record expense" disabled={disabled} onPress={draft.submit} />
    </Section>
  );
}
function SplitFields({ draft, options, disabled }: Props) {
  if (draft.split === "exact")
    return (
      <>
        <Text>{`${options.members[0].displayName}’s share in CHF`}</Text>
        <TextInput value={draft.firstExact} keyboardType="decimal-pad" editable={!disabled} />
        <Text>{`${options.members[1].displayName}’s share in CHF`}</Text>
        <TextInput value={draft.secondExact} keyboardType="decimal-pad" editable={!disabled} />
      </>
    );
  if (draft.split === "percentage")
    return (
      <>
        <Text>{`${options.members[0].displayName}’s percentage (0–100)`}</Text>
        <TextInput value={draft.firstPercent} keyboardType="decimal-pad" editable={!disabled} />
        <Text>{`${options.members[1].displayName} receives the remaining percentage.`}</Text>
      </>
    );
  return <Text>Split equally. Any odd centime belongs to the payer’s share.</Text>;
}
function CategoryPages({ options, disabled, next, first }: Props) {
  return (
    <>
      {options.categories.categories.length === 0 ? (
        <Note>No active categories on this page. A category is optional.</Note>
      ) : null}
      {options.categories.after ? (
        <NativeAction label="First categories" disabled={disabled} onPress={first} />
      ) : null}
      {options.categories.next ? (
        <NativeAction label="More categories" disabled={disabled} onPress={next} />
      ) : null}
    </>
  );
}

function CategoryFields({ draft, options, disabled }: Props) {
  return (
    <>
      <Text>Category (optional)</Text>
      <Picker
        selectedValue={draft.category?.categoryId ?? ""}
        enabled={!disabled}
        onValueChange={(value) =>
          draft.setCategory(
            value === draft.category?.categoryId
              ? draft.category
              : (options.categories.categories.find((category) => category.categoryId === value) ??
                  null),
          )
        }
      >
        <Picker.Item label="No category" value="" />
        {draft.category &&
        !options.categories.categories.some(
          (category) => category.categoryId === draft.category!.categoryId,
        ) ? (
          <Picker.Item label={draft.category.name} value={draft.category.categoryId} />
        ) : null}
        {options.categories.categories.map((category) => (
          <Picker.Item
            key={category.categoryId}
            label={category.name}
            value={category.categoryId}
          />
        ))}
      </Picker>
    </>
  );
}
