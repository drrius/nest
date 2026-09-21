import * as Schema from "effect/Schema";
import { MoneyBalance } from "@nest/contracts/money";
import { MoneyHistory } from "@nest/contracts/money-history";
import { MoneyDetail } from "@nest/contracts/money-detail";
const Uuid = Schema.String.check(Schema.isUUID());
const SavedAt = Schema.String.check(
  Schema.makeFilter((value) => {
    const time = new Date(value);
    return Number.isFinite(time.getTime()) && time.toISOString() === value;
  }),
);
// Local save time is a stale-view label, never a financial revision or authorization.
const metadata = { version: Schema.Literal(1), savedAt: SavedAt };
export const MoneyCacheEntry = Schema.Union([
  Schema.Struct({ ...metadata, kind: Schema.Literal("balance"), value: MoneyBalance }),
  Schema.Struct({ ...metadata, kind: Schema.Literal("history"), value: MoneyHistory }),
  Schema.Struct({ ...metadata, kind: Schema.Literal("detail"), value: MoneyDetail }),
]);
export const MoneyCacheTarget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("balance") }),
  Schema.Struct({ kind: Schema.Literal("history"), before: Schema.NullOr(Uuid) }),
  Schema.Struct({ kind: Schema.Literal("detail"), eventId: Uuid }),
]);
export type MoneyCacheEntry = typeof MoneyCacheEntry.Type;
export type MoneyCacheTarget = typeof MoneyCacheTarget.Type;
export function moneyTargetKey(target: MoneyCacheTarget) {
  if (target.kind === "balance") return "";
  return (target.kind === "history" ? (target.before ?? "") : target.eventId).toLowerCase();
}
export function moneyEntryKey(entry: MoneyCacheEntry) {
  if (entry.kind === "balance") return "";
  return (
    entry.kind === "history" ? (entry.value.before ?? "") : entry.value.event.eventId
  ).toLowerCase();
}
