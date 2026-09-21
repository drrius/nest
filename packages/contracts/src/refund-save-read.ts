import * as Schema from "effect/Schema";
import { SaveRefund, RefundReceipt } from "./refund.ts";
const Uuid = SaveRefund.fields.operationId;
export const RefundSaveQuery = Schema.Struct({ operationId: Uuid });
export const RefundSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(RefundReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.receipt === null) return value.status !== "recorded";
    return (
      value.status === "recorded" &&
      value.receipt.approvalId === null &&
      value.receipt.actorId === value.actorId &&
      value.receipt.householdId === value.householdId &&
      value.receipt.operationId === value.operationId
    );
  }),
);
export type RefundSaveResult = typeof RefundSaveResult.Type;
