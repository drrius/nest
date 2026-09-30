import type { ExpenseInput } from "@nest/contracts/expense";
import { formatChf } from "./format.ts";
export function savedLegacyExpenseText(
  expense: ExpenseInput,
  actor: string,
  categoryLabel?: string,
) {
  const who = (id: string) => (id === actor ? "You" : "Other household member");
  return [
    `${expense.description}\n${formatChf(expense.amountCentimes)} · ${expense.date}`,
    `Payer: ${who(expense.payerId)}`,
    expense.allocations
      .map((share) => `${who(share.memberId)}: ${formatChf(share.centimes)}`)
      .join("\n"),
    `Category: ${categoryLabel ?? expense.categoryId ?? "None"}\nNote: ${expense.note ?? "None"}`,
    "These are the exact expense terms. Confirmation applies only to this draft.",
  ].join("\n\n");
}
