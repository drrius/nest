import type { ExpenseInput } from "@nest/contracts/expense";
import { Note } from "../components/page";
import { groceryExpenseSummary } from "./grocery-expense-display";
export function GroceryExpenseSummary({ expense }: { expense: ExpenseInput }) {
  return expense.receiptTotalCentimes === undefined ? null : (
    <Note>{groceryExpenseSummary(expense)}</Note>
  );
}
