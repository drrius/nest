import * as Schema from "effect/Schema";
import { ExpenseInput } from "./expense.ts";
const Uuid = ExpenseInput.fields.payerId;
export const OpeningReplacement = Schema.Struct({
  description: ExpenseInput.fields.description,
  amountCentimes: ExpenseInput.fields.amountCentimes,
  payerId: Uuid,
  date: ExpenseInput.fields.date,
  note: ExpenseInput.fields.note,
});
export const CorrectionReplacement = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("expense"),
    expense: ExpenseInput.check(Schema.makeFilter((value) => value.receiptPath === undefined)),
  }),
  Schema.Struct({ kind: Schema.Literal("opening_balance"), opening: OpeningReplacement }),
]);
export const CorrectionInput = Schema.Struct({
  sourceEventId: Uuid,
  expectedReversalId: Schema.NullOr(Uuid),
  replacement: Schema.NullOr(CorrectionReplacement),
}).check(
  Schema.makeFilter(
    (value) =>
      value.sourceEventId.toLowerCase() !== value.expectedReversalId?.toLowerCase() &&
      (value.expectedReversalId === null || value.replacement?.kind === "opening_balance"),
  ),
);
export type CorrectionInput = typeof CorrectionInput.Type;
export const SaveCorrection = Schema.Struct({ operationId: Uuid, correction: CorrectionInput });
export const ExecuteCorrection = Schema.Struct({ ...SaveCorrection.fields, approvalId: Uuid });
export const CorrectionReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  reversalEventId: Uuid,
  replacementEventId: Schema.NullOr(Uuid),
  correction: CorrectionInput,
}).check(
  Schema.makeFilter((value) => {
    const source = value.correction.sourceEventId;
    return (
      value.reversalEventId !== source &&
      value.replacementEventId !== source &&
      value.replacementEventId !== value.reversalEventId &&
      (value.replacementEventId === null) === (value.correction.replacement === null) &&
      (value.correction.expectedReversalId === null ||
        value.reversalEventId === value.correction.expectedReversalId)
    );
  }),
);
export type CorrectionReceipt = typeof CorrectionReceipt.Type;
export function canonicalCorrection(input: CorrectionInput): CorrectionInput {
  let replacement = input.replacement;
  if (replacement?.kind === "expense") {
    const expense = replacement.expense;
    const share = (value: ExpenseInput["allocations"][number]) => ({
      ...value,
      memberId: value.memberId.toLowerCase(),
    });
    replacement = {
      kind: "expense",
      expense: {
        ...expense,
        payerId: expense.payerId.toLowerCase(),
        categoryId: expense.categoryId?.toLowerCase() ?? null,
        allocations: [share(expense.allocations[0]), share(expense.allocations[1])],
      },
    };
  } else if (replacement?.kind === "opening_balance") {
    replacement = {
      kind: "opening_balance",
      opening: { ...replacement.opening, payerId: replacement.opening.payerId.toLowerCase() },
    };
  }
  return {
    ...input,
    sourceEventId: input.sourceEventId.toLowerCase(),
    expectedReversalId: input.expectedReversalId?.toLowerCase() ?? null,
    replacement,
  };
}
