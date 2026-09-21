import { Alert } from "react-native";
import type { ExpenseEntryOptions } from "./entry-options";
import { parseExpenseDraft, type ExpenseDraft } from "./expense-draft";
import { expenseReview } from "./expense-review";
import type { ExpenseSaveRuntime } from "./save-runtime";
import type { ReceiptAttachmentRuntime } from "./receipt-attachment-runtime";
import { receiptStillMatches } from "./receipt-draft";
export function confirmExpense(
  draft: ExpenseDraft,
  context: {
    members: ExpenseEntryOptions["members"] | null;
    runtime: ExpenseSaveRuntime;
    attachment: ReceiptAttachmentRuntime;
    operationId: string;
    error: (message: string | null) => void;
  },
) {
  const { members, runtime, attachment, operationId, error } = context;
  if (!members) return error("Load the current household members before saving.");
  const parsed = parseExpenseDraft(draft, [members[0].actorId, members[1].actorId]);
  if (!parsed.ok) return error(parsed.message);
  const expense = parsed.expense,
    path = expense.receiptPath ?? null;
  if (!receiptStillMatches(attachment, path))
    return error("Review the current receipt selection online before saving.");
  error(null);
  Alert.alert("Record this expense?", expenseReview(expense, members), [
    { text: "Cancel", style: "cancel" },
    {
      text: "Record expense",
      onPress: () => {
        if (!receiptStillMatches(attachment, path))
          return error("The receipt selection changed. Review the expense again.");
        void runtime.save({ operationId, expense });
      },
    },
  ]);
}
