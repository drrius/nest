import * as Schema from "effect/Schema";
import { SaveRecurring, RecurringReceipt } from "./recurring.ts";
const Uuid = SaveRecurring.fields.operationId;
export const RecurringSaveQuery = Schema.Struct({ operationId: Uuid });
export const RecurringSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(RecurringReceipt),
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
export type RecurringSaveResult = typeof RecurringSaveResult.Type;
