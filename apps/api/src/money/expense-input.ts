import type { ExpenseInput } from "@nest/contracts/expense";

export function canonicalExpense(input: ExpenseInput): ExpenseInput {
  const share = (value: (typeof input.allocations)[0]) => ({
    ...value,
    memberId: value.memberId.toLowerCase(),
  });
  return {
    ...input,
    payerId: input.payerId.toLowerCase(),
    categoryId: input.categoryId?.toLowerCase() ?? null,
    allocations: [share(input.allocations[0]), share(input.allocations[1])],
  };
}
