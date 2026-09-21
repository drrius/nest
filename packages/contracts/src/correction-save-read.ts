import * as Schema from "effect/Schema";
import { SaveCorrection, CorrectionReceipt } from "./correction.ts";
const Uuid = SaveCorrection.fields.operationId;
export const CorrectionSaveQuery = Schema.Struct({ operationId: Uuid });
export const CorrectionSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(CorrectionReceipt),
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
export type CorrectionSaveResult = typeof CorrectionSaveResult.Type;
