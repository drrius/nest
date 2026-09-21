import * as Schema from "effect/Schema";
import { SaveRecurringState, RecurringStateReceipt } from "./recurring-state.ts";
const Uuid = SaveRecurringState.fields.operationId;
export const RecurringStateSaveQuery = Schema.Struct({ operationId: Uuid });
export const RecurringStateSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(RecurringStateReceipt),
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
export type RecurringStateSaveResult = typeof RecurringStateSaveResult.Type;
