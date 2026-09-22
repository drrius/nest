import { useNativeState } from "@expo/ui";
import { useState } from "react";
import type { RecurringDraft } from "./recurring-draft";
import { expenseDate } from "./use-expense-draft";
export function useRecurringFields(initial: RecurringDraft, categoryName = "Current category") {
  const description = useNativeState(initial.description),
    amount = useNativeState(initial.amount),
    note = useNativeState(initial.note),
    firstExact = useNativeState(initial.firstExact),
    secondExact = useNativeState(initial.secondExact),
    firstPercent = useNativeState(initial.firstPercent),
    receiptTotal = useNativeState("");
  const [payerId, setPayer] = useState(initial.payerId),
    [split, setSplit] = useState(initial.split),
    [mode, setMode] = useState(initial.mode),
    [cadence, setCadence] = useState(initial.cadence),
    [day, setDay] = useState(initial.day);
  const [date, setDate] = useState(() => new Date(`${initial.date}T12:00:00`));
  const [category, setCategory] = useState<{ categoryId: string; name: string } | null>(
    initial.categoryId ? { categoryId: initial.categoryId, name: categoryName } : null,
  );
  const read = (): RecurringDraft => ({
    ...initial,
    description: description.value,
    amount: amount.value,
    note: note.value,
    firstExact: firstExact.value,
    secondExact: secondExact.value,
    firstPercent: firstPercent.value,
    payerId,
    split,
    mode,
    cadence,
    day,
    date: expenseDate(date),
    categoryId: category?.categoryId ?? null,
  });
  return {
    description,
    amount,
    note,
    firstExact,
    secondExact,
    firstPercent,
    receiptTotal,
    payerId,
    setPayer,
    split,
    setSplit,
    date,
    setDate,
    category,
    setCategory,
    grocery: false,
    mode,
    setMode,
    cadence,
    setCadence,
    day,
    setDay,
    read,
  };
}
