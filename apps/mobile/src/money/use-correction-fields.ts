import type { CorrectionContext } from "@nest/contracts/correction-context";
import type { CorrectionDraft } from "./correction-draft";
import { useExpenseFields } from "./use-expense-fields";
export function useCorrectionFields(initial: CorrectionDraft, context: CorrectionContext) {
  const category = context.source.category;
  return useExpenseFields(
    initial,
    category ? { categoryId: category.id, name: category.name } : null,
  );
}
