import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useLeaveExpense } from "./use-leave-expense";
import * as Crypto from "expo-crypto";
import type { ExpenseEntryOptions } from "./entry-options";
import type { ExpenseSaveRuntime } from "./save-runtime";
import { initialExpenseDraft, parseExpenseDraft, type ExpenseDraft } from "./expense-draft";
import { expenseReview } from "./expense-review";
export function expenseDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function useExpenseDraft(
  actor: string,
  members: ExpenseEntryOptions["members"] | null,
  runtime: ExpenseSaveRuntime,
  grocery = false,
) {
  const [initial] = useState(() => initialExpenseDraft(actor, expenseDate(new Date()), grocery));
  const [operationId, setOperationId] = useState(Crypto.randomUUID);
  const description = useNativeState(initial.description),
    amount = useNativeState(initial.amount),
    note = useNativeState(initial.note);
  const receiptTotal = useNativeState(initial.receiptTotal ?? "");
  const firstExact = useNativeState(""),
    secondExact = useNativeState(""),
    firstPercent = useNativeState("50");
  const [payerId, setPayer] = useState(actor),
    [split, setSplit] = useState<ExpenseDraft["split"]>("equal");
  const [date, setDate] = useState(() => new Date()),
    [category, setCategory] = useState<{ categoryId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = (): ExpenseDraft => ({
    description: description.value,
    amount: amount.value,
    receiptTotal: grocery ? receiptTotal.value : null,
    note: note.value,
    firstExact: firstExact.value,
    secondExact: secondExact.value,
    firstPercent: firstPercent.value,
    payerId,
    split,
    date: expenseDate(date),
    categoryId: category?.categoryId ?? null,
  });
  useLeaveExpense(initial, read, runtime);
  const submit = () => {
    if (!members) return setError("Load the current household members before saving.");
    const parsed = parseExpenseDraft(read(), [members[0].actorId, members[1].actorId]);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const expense = parsed.expense;
    Alert.alert("Record this expense?", expenseReview(expense, members), [
      { text: "Cancel", style: "cancel" },
      { text: "Record expense", onPress: () => void runtime.save({ operationId, expense }) },
    ]);
  };
  const nextExpense = () => {
    setOperationId(Crypto.randomUUID());
    setError(null);
    runtime.acknowledge();
  };
  return {
    nextExpense,
    grocery,
    receiptTotal,
    description,
    amount,
    note,
    firstExact,
    secondExact,
    firstPercent,
    payerId,
    setPayer,
    split,
    setSplit,
    date,
    setDate,
    category,
    setCategory,
    error,
    submit,
  };
}
export type NativeExpenseDraft = ReturnType<typeof useExpenseDraft>;
