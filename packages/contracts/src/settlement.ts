import * as Schema from "effect/Schema";
import { ExpenseInput } from "./expense.ts";
import { SignedCentimes } from "./money.ts";
const Uuid = ExpenseInput.fields.payerId;
const Positive = SignedCentimes.check(Schema.makeFilter((value) => BigInt(value) > 0n));
export const SettlementInput = Schema.Struct({
  description: ExpenseInput.fields.description,
  amountCentimes: Positive,
  expectedOutstandingCentimes: Positive,
  payerId: Uuid,
  recipientId: Uuid,
  mode: Schema.Literals(["full", "partial"]),
  date: ExpenseInput.fields.date,
  note: ExpenseInput.fields.note,
}).check(
  Schema.makeFilter(
    (value) =>
      value.payerId.toLowerCase() !== value.recipientId.toLowerCase() &&
      BigInt(value.amountCentimes) <= BigInt(value.expectedOutstandingCentimes) &&
      (value.mode !== "full" || value.amountCentimes === value.expectedOutstandingCentimes),
  ),
);
export type SettlementInput = typeof SettlementInput.Type;
export const SaveSettlement = Schema.Struct({ operationId: Uuid, settlement: SettlementInput });
export const ExecuteSettlement = Schema.Struct({ ...SaveSettlement.fields, approvalId: Uuid });
export const SettlementReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  eventId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  settlement: SettlementInput,
}).check(
  Schema.makeFilter((value) =>
    [value.settlement.payerId, value.settlement.recipientId].includes(value.actorId),
  ),
);
export type SettlementReceipt = typeof SettlementReceipt.Type;
