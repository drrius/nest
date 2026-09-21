import type { ExpenseInput } from "@nest/contracts/expense";
import { formatChf } from "./format.ts";
export function groceryExpenseSummary(expense: ExpenseInput) {
  return expense.receiptTotalCentimes === undefined
    ? ""
    : `Receipt total: ${formatChf(expense.receiptTotalCentimes)}\nShared amount: ${formatChf(expense.amountCentimes)}. Only the shared amount affects your balance.\n`;
}
