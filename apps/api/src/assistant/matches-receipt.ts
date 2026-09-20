import { RoutineReceipt } from "@nest/contracts/routines";
import * as Schema from "effect/Schema";
import { MemoryApprovalEnvelope, MemoryReceipt } from "@nest/contracts/memory";
import type { AssistantAction } from "@nest/contracts/assistant-actions";
type Member = { userId: string; householdId: string };
export function matchesAssistantReceipt(
  action: AssistantAction,
  input: object,
  receipt: object,
  member: Member,
) {
  if (action === "editRoutine") return matchesRoutineEdit(input, receipt, member);
  if (action === "createRoutine") return matchesRoutine(receipt, member);
  if (action === "proposeMemory") return matchesProposal(input, receipt, member);
  if (action === "removeMemory")
    return (
      Schema.is(MemoryReceipt)(receipt) &&
      matchesPreferences(input, receipt, member) &&
      "memoryId" in input &&
      matchesTarget(input.memoryId, receipt.memoryId) &&
      receipt.removed
    );
  if (
    ["saveFoodPreferences", "saveCookingPreferences", "saveNotificationPreferences"].includes(
      action,
    )
  )
    return matchesPreferences(input, receipt, member);
  return matchesCommand(input, receipt, action);
}
function matchesProposal(input: object, receipt: object, member: Member) {
  if (!Schema.is(MemoryApprovalEnvelope)(receipt)) return false;
  if (!("memoryId" in input && "expectedRevision" in input && "content" in input)) return false;
  const change = receipt.approval.change;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    change.expectedRevision === input.expectedRevision &&
    change.content === input.content &&
    (input.memoryId === null || matchesTarget(input.memoryId, change.memoryId))
  );
}
function matchesPreferences(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  return (
    "actorId" in receipt &&
    "householdId" in receipt &&
    "revision" in receipt &&
    "expectedRevision" in input &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    BigInt(String(receipt.revision)) === BigInt(String(input.expectedRevision)) + 1n
  );
}
function matchesCommand(input: object, receipt: object, action: AssistantAction) {
  if ("occurrenceId" in input && "occurrenceId" in receipt)
    return String(input.occurrenceId).toLowerCase() === receipt.occurrenceId;
  if (
    "itemId" in input &&
    "target" in receipt &&
    String(input.itemId).toLowerCase() !== receipt.target
  )
    return false;
  if ("checked" in input && "checked" in receipt && input.checked !== receipt.checked) return false;
  return !("removed" in receipt) || receipt.removed === (action === "removeGrocery");
}

function matchesTarget(input: unknown, target: string) {
  return typeof input === "string" && input.toLowerCase() === target;
}

function matchesRoutine(receipt: object, member: Member) {
  return (
    Schema.is(RoutineReceipt)(receipt) &&
    receipt.action === "create" &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId
  );
}

function matchesRoutineEdit(input: object, receipt: object, member: Member) {
  return (
    Schema.is(RoutineReceipt)(receipt) &&
    receipt.action === "edit" &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    "routineId" in input &&
    matchesTarget(input.routineId, receipt.routineId)
  );
}
