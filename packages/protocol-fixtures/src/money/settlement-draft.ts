import * as Schema from "effect/Schema";
import { MoneyBalance } from "@nest/contracts/money";
import { SettlementInput } from "@nest/contracts/settlement";
import { parseChf } from "@nest/domain/money";
export interface SettlementDraft {
  description: string;
  amount: string;
  mode: "full" | "partial";
  date: string;
  note: string;
}
export function initialSettlementDraft(date: string): SettlementDraft {
  return { description: "Settlement", amount: "", mode: "full", date, note: "" };
}
export function settlementBalance(balance: typeof MoneyBalance.Type) {
  if (!Schema.is(MoneyBalance)(balance)) return null;
  const payer = balance.members.find((member) => BigInt(member.centimes) < 0n);
  const recipient = balance.members.find((member) => BigInt(member.centimes) > 0n);
  return payer && recipient
    ? { payer, recipient, outstanding: String(-BigInt(payer.centimes)) }
    : null;
}
export type SettlementDraftResult =
  | { ok: true; settlement: SettlementInput }
  | { ok: false; message: string };
export function parseSettlementDraft(
  draft: SettlementDraft,
  balance: typeof MoneyBalance.Type,
): SettlementDraftResult {
  const pair = settlementBalance(balance);
  if (!pair) return { ok: false, message: "There is no outstanding household balance to settle." };
  const amount = draft.mode === "full" ? Number(pair.outstanding) : parseChf(draft.amount);
  if (amount === null || amount <= 0 || BigInt(amount) > BigInt(pair.outstanding))
    return {
      ok: false,
      message:
        "Enter a positive CHF amount, with at most two decimal places, up to the outstanding balance.",
    };
  const settlement = {
    description: draft.description.trim(),
    amountCentimes: String(amount),
    expectedOutstandingCentimes: pair.outstanding,
    payerId: pair.payer.actorId.toLowerCase(),
    recipientId: pair.recipient.actorId.toLowerCase(),
    mode: draft.mode,
    date: draft.date,
    note: draft.note.trim() || null,
  };
  return Schema.is(SettlementInput)(settlement)
    ? { ok: true, settlement }
    : {
        ok: false,
        message:
          "Check the description (up to 200 characters), date and note (up to 4,000 characters).",
      };
}
