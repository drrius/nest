import { fixture as expense } from "./ai-expense-fixture.mjs";
export { id, as, json } from "./ai-expense-fixture.mjs";
export const groceryMigration = "supabase/migrations/20260921144718_native_grocery_expense.sql";
export function fixture(t) {
  const f = expense(t);
  f.db.file("supabase/migrations/20260921130419_native_expense_save_cancel.sql");
  f.db.file("supabase/migrations/20260921105214_native_money_detail_read.sql");
  f.db.file(groceryMigration);
  return f;
}
