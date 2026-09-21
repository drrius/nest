import { Text, TextInput } from "@expo/ui";
import type { NativeExpenseDraft } from "./use-expense-draft";
export function ExpenseAmountFields({
  draft,
  disabled,
}: {
  draft: NativeExpenseDraft;
  disabled: boolean;
}) {
  return (
    <>
      {draft.grocery ? (
        <>
          <Text>Receipt total in CHF</Text>
          <TextInput
            value={draft.receiptTotal}
            keyboardType="decimal-pad"
            placeholder="0.00"
            editable={!disabled}
          />
          <Text>
            Enter the shared portion separately. Only the shared amount affects your balance.
          </Text>
        </>
      ) : null}
      <Text>{draft.grocery ? "Shared amount in CHF" : "Amount in CHF"}</Text>
      <TextInput
        value={draft.amount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        editable={!disabled}
      />
    </>
  );
}
