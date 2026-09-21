import * as Schema from "effect/Schema";
import { ExpenseInput } from "./expense.ts";
import { MoneyDetail } from "./money-detail.ts";
const Uuid = ExpenseInput.fields.payerId;
const Shares = ExpenseInput.fields.allocations;
export const RefundInput = Schema.Struct({
  sourceEventId: Uuid,
  description: ExpenseInput.fields.description,
  amountCentimes: ExpenseInput.fields.amountCentimes.check(
    Schema.makeFilter((value) => BigInt(value) > 0n),
  ),
  payerId: Uuid,
  allocations: Shares,
  expectedRemaining: Shares,
  date: ExpenseInput.fields.date,
  note: ExpenseInput.fields.note,
}).check(Schema.makeFilter(validRefund));
export type RefundInput = typeof RefundInput.Type;
function validRefund(input: {
  payerId: string;
  amountCentimes: string;
  allocations: typeof Shares.Type;
  expectedRemaining: typeof Shares.Type;
}) {
  const remaining = input.expectedRemaining;
  return (
    remaining[0].memberId.toLowerCase() !== remaining[1].memberId.toLowerCase() &&
    remaining.some((share) => share.memberId.toLowerCase() === input.payerId.toLowerCase()) &&
    remaining.reduce((sum, share) => sum + BigInt(share.centimes), 0n) <= 9007199254740991n &&
    input.allocations[0].memberId.toLowerCase() !== input.allocations[1].memberId.toLowerCase() &&
    input.allocations.reduce((sum, share) => sum + BigInt(share.centimes), 0n) ===
      BigInt(input.amountCentimes) &&
    input.allocations.every((share) => {
      const cap = remaining.find(
        (item) => item.memberId.toLowerCase() === share.memberId.toLowerCase(),
      );
      return cap !== undefined && BigInt(share.centimes) <= BigInt(cap.centimes);
    })
  );
}
export const SaveRefund = Schema.Struct({ operationId: Uuid, refund: RefundInput });
export const ExecuteRefund = Schema.Struct({ ...SaveRefund.fields, approvalId: Uuid });
export const RefundReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  eventId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  refund: RefundInput,
}).check(
  Schema.makeFilter(
    (value) =>
      value.eventId !== value.refund.sourceEventId &&
      value.refund.allocations.some((share) => share.memberId === value.actorId),
  ),
);
export type RefundReceipt = typeof RefundReceipt.Type;
export const RefundContextQuery = Schema.Struct({ sourceEventId: Uuid });
export const RefundContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  source: MoneyDetail,
  remaining: Shares,
  refundable: Schema.Boolean,
}).check(Schema.makeFilter(validContext));
export type RefundContext = typeof RefundContext.Type;
function validContext(value: {
  householdId: string;
  source: typeof MoneyDetail.Type;
  remaining: typeof Shares.Type;
  refundable: boolean;
}) {
  const source = value.source;
  return (
    value.householdId === source.householdId &&
    ["expense", "replacement"].includes(source.event.kind) &&
    value.remaining[0].memberId !== value.remaining[1].memberId &&
    value.remaining.every((share) => {
      const original = source.shares.find((item) => item.memberId === share.memberId);
      return (
        original?.allocatedCentimes != null &&
        BigInt(share.centimes) <= BigInt(original.allocatedCentimes)
      );
    }) &&
    value.refundable ===
      (source.reversedById === null && value.remaining.some((share) => BigInt(share.centimes) > 0n))
  );
}
export function canonicalRefund(input: RefundInput): RefundInput {
  const share = (value: RefundInput["allocations"][number]) => ({
    ...value,
    memberId: value.memberId.toLowerCase(),
  });
  return {
    ...input,
    sourceEventId: input.sourceEventId.toLowerCase(),
    payerId: input.payerId.toLowerCase(),
    allocations: [share(input.allocations[0]), share(input.allocations[1])],
    expectedRemaining: [share(input.expectedRemaining[0]), share(input.expectedRemaining[1])],
  };
}
