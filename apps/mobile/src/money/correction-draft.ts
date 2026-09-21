import * as Schema from "effect/Schema";
import { CorrectionInput, OpeningReplacement } from "@nest/contracts/correction";
import { CorrectionContext } from "@nest/contracts/correction-context";
import { parseChf } from "@nest/domain/money";
import { initialExpenseDraft, parseExpenseDraft, type ExpenseDraft } from "./expense-draft.ts";
export interface CorrectionDraft extends ExpenseDraft {
  mode: "reverse" | "replace";
}
export function centimeInput(value: string) {
  const cents = BigInt(value);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}
export function initialCorrectionDraft(context: CorrectionContext): CorrectionDraft {
  const { source } = context,
    event = source.event;
  return {
    ...initialExpenseDraft(event.payerId ?? source.shares[0].memberId, event.occurredOn),
    mode: context.canReplace ? "replace" : "reverse",
    description: event.description,
    amount: centimeInput(event.amountCentimes),
    receiptTotal:
      source.receiptTotalCentimes == null ? null : centimeInput(source.receiptTotalCentimes),
    split: "exact",
    firstExact: centimeInput(source.shares[0].allocatedCentimes ?? "0"),
    secondExact: centimeInput(source.shares[1].allocatedCentimes ?? "0"),
    categoryId: source.category?.id ?? null,
    note: source.note ?? "",
  };
}
export type CorrectionDraftResult =
  | { ok: true; correction: CorrectionInput }
  | { ok: false; message: string };
export function parseCorrectionDraft(
  draft: CorrectionDraft,
  context: CorrectionContext,
  actor: string,
): CorrectionDraftResult {
  if (!validContext(context, actor, draft))
    return { ok: false, message: "Load the current entry before reviewing a correction." };
  const base = {
    sourceEventId: context.source.event.eventId,
    expectedReversalId: context.source.reversedById,
  };
  if (draft.mode === "reverse")
    return context.canReverse
      ? { ok: true, correction: { ...base, replacement: null } }
      : { ok: false, message: "This entry cannot be reversed. Reload its current history." };
  if (draft.mode !== "replace" || !context.canReplace)
    return { ok: false, message: "This entry cannot be replaced. Reload its current history." };
  const pair: readonly [string, string] = [
    context.source.shares[0].memberId,
    context.source.shares[1].memberId,
  ];
  if (context.source.event.kind === "opening_balance") return openingCorrection(draft, base, pair);
  if (context.source.receiptTotalCentimes != null && draft.receiptTotal === null)
    return { ok: false, message: "Review the grocery receipt total." };
  const parsed = parseExpenseDraft(draft, pair);
  return parsed.ok
    ? {
        ok: true,
        correction: { ...base, replacement: { kind: "expense", expense: parsed.expense } },
      }
    : parsed;
}
function openingCorrection(
  draft: CorrectionDraft,
  base: { sourceEventId: string; expectedReversalId: string | null },
  pair: readonly [string, string],
): CorrectionDraftResult {
  const cents = parseChf(draft.amount);
  const opening = {
    description: draft.description.trim(),
    amountCentimes: String(cents),
    payerId: draft.payerId,
    date: draft.date,
    note: draft.note.trim() || null,
  };
  if (!pair.includes(opening.payerId) || !Schema.is(OpeningReplacement)(opening))
    return {
      ok: false,
      message: "Check the opening amount, creditor, description, date and note.",
    };
  return { ok: true, correction: { ...base, replacement: { kind: "opening_balance", opening } } };
}

function validContext(context: CorrectionContext, actor: string, draft: CorrectionDraft) {
  return (
    draft.receiptPath == null &&
    Schema.is(CorrectionContext)(context) &&
    context.source.shares.some((share) => share.memberId === actor)
  );
}
