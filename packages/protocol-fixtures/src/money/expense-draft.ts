import * as Schema from "effect/Schema";
import { ExpenseInput } from "@nest/contracts/expense";
import {
  equalAllocation,
  exactAllocation,
  percentageAllocation,
  parseChf,
  type Allocations,
} from "@nest/domain/money";
export interface ExpenseDraft {
  receiptPath?: string | null;
  receiptPending?: boolean;
  description: string;
  amount: string;
  receiptTotal: string | null;
  payerId: string;
  split: "equal" | "exact" | "percentage";
  firstExact: string;
  secondExact: string;
  firstPercent: string;
  date: string;
  note: string;
  categoryId: string | null;
}
export type ExpenseDraftResult =
  | { ok: true; expense: ExpenseInput }
  | { ok: false; message: string };
const invalid = (message: string): ExpenseDraftResult => ({ ok: false, message });
export function initialExpenseDraft(actor: string, date: string, grocery = false): ExpenseDraft {
  return {
    receiptPath: null,
    receiptPending: false,
    description: grocery ? "Groceries" : "",
    receiptTotal: grocery ? "" : null,
    amount: "",
    payerId: actor.toLowerCase(),
    split: "equal",
    firstExact: "",
    secondExact: "",
    firstPercent: "50",
    date,
    note: "",
    categoryId: null,
  };
}
function validMembers(pair: readonly [string, string], payer: string) {
  const ids = pair.map((value) => value.toLowerCase());
  return (
    ids[0] !== ids[1] &&
    ids.includes(payer.toLowerCase()) &&
    ids.every((value) => Schema.is(ExpenseInput.fields.payerId)(value))
  );
}
function splitExpense(
  draft: ExpenseDraft,
  amount: number,
  pair: readonly [string, string],
): Allocations | null {
  const payer = draft.payerId.toLowerCase();
  const other = pair[0] === payer ? pair[1] : pair[0];
  if (draft.split === "equal") return equalAllocation(amount, payer, other);
  if (draft.split === "percentage") {
    const basisPoints = parseChf(draft.firstPercent);
    if (basisPoints === null || basisPoints > 10000) return null;
    return percentageAllocation(
      amount,
      payer,
      other,
      pair[0] === payer ? basisPoints : 10000 - basisPoints,
    );
  }
  if (draft.split !== "exact") return null;
  return exactShares(draft, amount, pair);
}
function exactShares(
  draft: ExpenseDraft,
  amount: number,
  pair: readonly [string, string],
): Allocations | null {
  const first = parseChf(draft.firstExact),
    second = parseChf(draft.secondExact);
  if (first === null || second === null || BigInt(first) + BigInt(second) !== BigInt(amount))
    return null;
  return exactAllocation(amount, pair, [
    { memberId: pair[0], centimes: first },
    { memberId: pair[1], centimes: second },
  ]);
}
export function parseExpenseDraft(
  draft: ExpenseDraft,
  memberIds: readonly [string, string],
): ExpenseDraftResult {
  if (draft.receiptPending)
    return invalid("Upload or remove the selected receipt before reviewing this expense.");
  if (!validMembers(memberIds, draft.payerId))
    return invalid("Choose a payer from your two household members.");
  const amount = parseChf(draft.amount);
  if (amount === null)
    return invalid(
      "Enter a CHF amount with at most two decimal places, without grouping separators.",
    );
  const pair: readonly [string, string] = [memberIds[0].toLowerCase(), memberIds[1].toLowerCase()];
  const shares = splitExpense(draft, amount, pair);
  if (!shares)
    return invalid(
      draft.split === "percentage"
        ? "Enter a percentage from 0 to 100 with at most two decimal places."
        : "Enter both exact shares in CHF. They must add up to the expense amount.",
    );
  return buildExpense(draft, amount, shares);
}
function buildExpense(
  draft: ExpenseDraft,
  amount: number,
  shares: Allocations,
): ExpenseDraftResult {
  const share = (value: Allocations[number]) => ({
    memberId: value.memberId,
    centimes: String(value.centimes),
  });
  const receiptTotal = draft.receiptTotal === null ? null : parseChf(draft.receiptTotal);
  if (draft.receiptTotal !== null && (receiptTotal === null || receiptTotal < amount))
    return invalid("Enter the receipt total in CHF. The shared amount cannot exceed it.");
  const expense = {
    ...receiptReference(draft),
    ...(receiptTotal === null ? {} : { receiptTotalCentimes: String(receiptTotal) }),
    description: draft.description.trim(),
    amountCentimes: String(amount),
    payerId: draft.payerId.toLowerCase(),
    allocations: [share(shares[0]), share(shares[1])] as const,
    date: draft.date,
    note: draft.note.trim() || null,
    categoryId: draft.categoryId?.toLowerCase() ?? null,
  };
  return Schema.is(ExpenseInput)(expense)
    ? { ok: true, expense }
    : invalid(
        "Check the description (up to 200 characters), date, category and note (up to 4,000 characters).",
      );
}

function receiptReference(draft: ExpenseDraft) {
  return draft.receiptPath == null ? {} : { receiptPath: draft.receiptPath };
}
