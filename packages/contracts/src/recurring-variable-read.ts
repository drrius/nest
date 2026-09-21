import * as Schema from "effect/Schema";
import { SaveVariableCycle, VariableCycleReceipt } from "./recurring-variable.ts";
const Uuid = SaveVariableCycle.fields.operationId;
export const VariableCycleSaveQuery = Schema.Struct({ operationId: Uuid });
export const VariableCycleSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(VariableCycleReceipt),
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
export type VariableCycleSaveResult = typeof VariableCycleSaveResult.Type;
