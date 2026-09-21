import * as Schema from "effect/Schema";
import { SaveSettlement, SettlementReceipt } from "./settlement.ts";
const Uuid = SaveSettlement.fields.operationId;
export const SettlementSaveQuery = Schema.Struct({ operationId: Uuid });
export const SettlementSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(SettlementReceipt),
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
export type SettlementSaveResult = typeof SettlementSaveResult.Type;
