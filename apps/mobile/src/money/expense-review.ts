import type { ExpenseInput } from "@nest/contracts/expense";
import type { ExpenseEntryOptions } from "./entry-options.ts";
import { formatChf } from "./format.ts";
import { groceryExpenseSummary } from "./grocery-expense-display.ts";
export function expenseReview(expense: ExpenseInput, members: ExpenseEntryOptions["members"]) {
  const name = (id: string) =>
    members.find((member) => member.actorId === id)?.displayName ?? "Household member";
  const shares = expense.allocations
    .map((share) => `${name(share.memberId)}: ${formatChf(share.centimes)}`)
    .join("\n");
  return `${expense.description}\n${groceryExpenseSummary(expense)}${formatChf(expense.amountCentimes)} · ${expense.date}\nPaid by ${name(expense.payerId)}\n${shares}\n\nThis updates shared Money. Nest does not transfer money.`;
}
