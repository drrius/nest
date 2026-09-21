import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID(), Schema.isPattern(/^[0-9a-f-]+$/));
// Recovery metadata only. Financial content is fetched online from the immutable approval.
export const SettlementApprovalAttempt = Schema.Struct({
  approvalId: Uuid,
  operationId: Uuid,
  approved: Schema.Boolean,
});
export type SettlementApprovalAttempt = typeof SettlementApprovalAttempt.Type;
