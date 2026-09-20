import * as Schema from "effect/Schema";
import { ChoreTransferReceipt } from "@nest/contracts/chore-transfers";

export function matchesTransfer(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(ChoreTransferReceipt)(receipt) ||
    receipt.actorId !== member.userId ||
    receipt.householdId !== member.householdId
  )
    return false;
  if ("requestId" in input && "action" in input)
    return sameId(input.requestId, receipt.requestId) && input.action === receipt.action;
  return matchesRequest(input, receipt);
}
function matchesRequest(input: object, receipt: typeof ChoreTransferReceipt.Type) {
  return (
    "occurrenceId" in input &&
    "expectedDueDate" in input &&
    "recipientId" in input &&
    sameId(input.occurrenceId, receipt.occurrenceId) &&
    sameId(input.recipientId, receipt.toMemberId) &&
    input.expectedDueDate === receipt.dueDate &&
    receipt.action === "request"
  );
}
function sameId(input: unknown, id: string) {
  return typeof input === "string" && input.toLowerCase() === id;
}
