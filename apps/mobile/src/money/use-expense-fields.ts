import { useNativeState } from "@expo/ui";
import { useState } from "react";
import type { ExpenseDraft } from "./expense-draft";
import { expenseDate } from "./use-expense-draft";
export function useExpenseFields(
  initial: ExpenseDraft,
  initialCategory: { categoryId: string; name: string } | null,
) {
  const description = useNativeState(initial.description),
    amount = useNativeState(initial.amount),
    note = useNativeState(initial.note),
    receiptTotal = useNativeState(initial.receiptTotal ?? "");
  const firstExact = useNativeState(initial.firstExact),
    secondExact = useNativeState(initial.secondExact),
    firstPercent = useNativeState(initial.firstPercent);
  const [payerId, setPayer] = useState(initial.payerId),
    [split, setSplit] = useState(initial.split);
  const [category, setCategory] = useState<{ categoryId: string; name: string } | null>(
    initialCategory,
  );
  const [date, setDate] = useState(() => {
    const value = new Date(`${initial.date}T12:00:00`);
    return Number.isNaN(value.getTime()) ? new Date() : value;
  });
  const grocery = initial.receiptTotal !== null;
  const read = () => ({
    ...initial,
    description: description.value,
    amount: amount.value,
    note: note.value,
    receiptTotal: grocery ? receiptTotal.value : null,
    firstExact: firstExact.value,
    secondExact: secondExact.value,
    firstPercent: firstPercent.value,
    payerId,
    split,
    date: expenseDate(date),
    categoryId: category?.categoryId ?? null,
  });
  return {
    description,
    amount,
    note,
    receiptTotal,
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
    grocery,
    read,
  };
}
