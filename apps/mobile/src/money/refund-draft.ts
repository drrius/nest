import * as Schema from "effect/Schema";
import { RefundContext, RefundInput } from "@nest/contracts/refund";
import { parseChf } from "@nest/domain/money";
export interface RefundDraft {
  description: string;
  own: string;
  partner: string;
  mode: "full" | "partial";
  date: string;
  note: string;
}
export function initialRefundDraft(date: string): RefundDraft {
  return { description: "Refund", own: "", partner: "", mode: "full", date, note: "" };
}
export type RefundDraftResult = { ok: true; refund: RefundInput } | { ok: false; message: string };
export function parseRefundDraft(
  draft: RefundDraft,
  context: RefundContext,
  actor: string,
): RefundDraftResult {
  if (
    !["full", "partial"].includes(draft.mode) ||
    !Schema.is(RefundContext)(context) ||
    !context.refundable ||
    !context.remaining.some((share) => share.memberId === actor)
  )
    return { ok: false, message: "Load current refundable shares before reviewing a refund." };
  const allocations = context.remaining.map((share) => ({
    memberId: share.memberId,
    centimes:
      draft.mode === "full"
        ? share.centimes
        : String(parseChf(share.memberId === actor ? draft.own : draft.partner)),
  }));
  if (allocations.some((share) => !/^\d+$/.test(share.centimes)))
    return {
      ok: false,
      message: "Enter both shares in CHF with at most two decimal places. Use 0 for no refund.",
    };
  const refund = {
    sourceEventId: context.source.event.eventId,
    description: draft.description.trim(),
    amountCentimes: String(allocations.reduce((sum, share) => sum + BigInt(share.centimes), 0n)),
    payerId: context.source.event.payerId,
    allocations,
    expectedRemaining: context.remaining,
    date: draft.date,
    note: draft.note.trim() || null,
  };
  return Schema.is(RefundInput)(refund)
    ? { ok: true, refund }
    : {
        ok: false,
        message:
          "Enter a positive refund within each person's remaining share. Check the description, date and note.",
      };
}
