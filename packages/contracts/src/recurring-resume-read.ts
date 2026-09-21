import * as Schema from "effect/Schema";
import { SaveRecurringResume, RecurringResumeReceipt } from "./recurring-resume.ts";
const Uuid = SaveRecurringResume.fields.operationId;
export const RecurringResumeSaveQuery = Schema.Struct({ operationId: Uuid });
export const RecurringResumeSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(RecurringResumeReceipt),
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
export type RecurringResumeSaveResult = typeof RecurringResumeSaveResult.Type;
