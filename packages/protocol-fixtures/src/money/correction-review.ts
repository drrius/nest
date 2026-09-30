import type { CorrectionInput } from "@nest/contracts/correction";
import type { CorrectionContext } from "@nest/contracts/correction-context";
import { formatChf } from "./format.ts";
export function correctionReview(
  input: CorrectionInput,
  context: CorrectionContext,
  actor: string,
) {
  const source = context.source;
  const name = (id: string) => (id === actor ? "You" : "Your partner");
  const old = source.shares
    .map((share) => `${name(share.memberId)}: ${formatChf(share.deltaCentimes, true)}`)
    .join("\n");
  const replacement = input.replacement;
  const next = replacementReview(replacement, actor);
  return `Original: ${source.event.description}\n${formatChf(source.event.amountCentimes)} · ${source.event.occurredOn}\nOriginal balance effect:\n${old}\n\n${next}\n\n${source.reversedById ? "The existing reversal is retained." : "The original balance effect will be reversed."} The original and correction stay in history. ${source.event.hasReceipt && replacement ? "The original receipt reference is retained. " : ""}Nest does not transfer money.`;
}

export function replacementReview(replacement: CorrectionInput["replacement"], actor: string) {
  const name = (id: string) => (id === actor ? "You" : "Your partner");
  let next = "Reverse this entry without creating a replacement.";
  if (replacement?.kind === "expense") {
    const expense = replacement.expense;
    next = `Replacement: ${expense.description}\n${formatChf(expense.amountCentimes)} · ${expense.date}\nPaid by ${name(expense.payerId)}\n${expense.allocations.map((share) => `${name(share.memberId)}: ${formatChf(share.centimes)}`).join("\n")}\n${expense.receiptTotalCentimes === undefined ? "" : `Receipt total: ${formatChf(expense.receiptTotalCentimes)}\n`}${expense.note ?? ""}`;
  } else if (replacement?.kind === "opening_balance") {
    const opening = replacement.opening;
    next = `Replacement opening: ${opening.description}\n${formatChf(opening.amountCentimes)} credited to ${name(opening.payerId)} · ${opening.date}\n${opening.note ?? ""}`;
  }
  return next;
}
