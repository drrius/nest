import type { MoneyEventSummary } from "@nest/contracts/money-history";
export function formatChf(centimes: string, signed = false) {
  const value = BigInt(centimes),
    amount = value < 0n ? -value : value;
  const francs = (amount / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  const sign = value < 0n ? "−" : signed && value > 0n ? "+" : "";
  return `${sign}CHF ${francs}.${(amount % 100n).toString().padStart(2, "0")}`;
}
export function balanceTitle(centimes: string) {
  const amount = BigInt(centimes);
  if (amount === 0n) return "You’re settled up";
  return amount > 0n
    ? `You’re owed ${formatChf(centimes)}`
    : `You owe ${formatChf((-amount).toString())}`;
}
export const eventNames: Record<typeof MoneyEventSummary.Type.kind, string> = {
  opening_balance: "Opening balance",
  expense: "Expense",
  refund: "Refund",
  settlement: "Settlement",
  reversal: "Reversal",
  replacement: "Corrected entry",
};
export function payerLabel(kind: typeof MoneyEventSummary.Type.kind, own: boolean) {
  const person = own ? "you" : "your partner";
  if (kind === "opening_balance") return `Opening balance credited to ${person}`;
  if (kind === "settlement") return `Payment recorded from ${person}`;
  if (kind === "refund") return `Refund received by ${person}`;
  return `Paid by ${person}`;
}
