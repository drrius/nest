import { files as correctionFiles } from "./ai-correction-fixture.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
const beforeGrocery = "supabase/migrations/20260921144718_native_grocery_expense.sql";
export const files = [
  ...correctionFiles.flatMap((file) =>
    file === beforeGrocery
      ? ["supabase/migrations/20260921130419_native_expense_save_cancel.sql", file]
      : [file],
  ),
  "tests/database/receipt-storage-fixture.sql",
  "tests/database/legacy-money/receipt-attachments.sql",
  "supabase/migrations/20260921165822_native_expense_receipt_binding.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const path = (n, home = 10) => `${id(home)}/receipts/${id(n)}.jpg`;
  const state = (target) =>
    f.db.sql(`select state from public.household_attachment_uploads where path='${target}'`);
  const cleanup = (target) =>
    `select * from public.begin_household_attachment_cleanup('${target}')`;
  const seed = (target) => {
    f.db.sql(as(`select public.reserve_household_attachment('${target}','image/jpeg')`));
    f.db.sql(
      `insert into storage.objects(bucket_id,name,metadata) values('household-files','${target}','{"mimetype":"image/jpeg","size":128}')`,
    );
  };
  const read = (sql) => JSON.parse(f.db.sql(as(sql)));
  const propose = (turn, input) =>
    read(
      `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','expense','proposeExpense',${json(input)})`,
    );
  const decide = (approval) =>
    `select public.nest_decide_expense('${id(10)}','${approval.operationId}',${json(approval.expense)},'${approval.id}',true)`;
  return { ...f, path, state, cleanup, seed, read, propose, decide };
}
