import { matchesMealAction } from "../meals/matches-receipt.ts";
import { matchesTransfer } from "./matches-transfer.ts";
import { ChoreChangeReceipt } from "@nest/contracts/chore-changes";
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
  const meal = matchesMealAction(action, input, receipt, member);
  if (meal !== null) return meal;
  if (["requestChoreTransfer", "respondChoreTransfer"].includes(action))
    return matchesTransfer(input, receipt, member);
  if (["skipChore", "rescheduleChore"].includes(action))
    return matchesChoreChange(action, input, receipt, member);
  if (["setRoutineState", "editRoutine", "createRoutine"].includes(action))
    return matchesRoutineCommand(action, input, receipt, member);
  if (action === "proposeMemory") return matchesProposal(input, receipt, member);
  if (action === "removeMemory") return matchesRemoval(input, receipt, member);
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

function matchesRoutineCommand(
  action: AssistantAction,
  input: object,
  receipt: object,
  member: Member,
) {
  if (
    !Schema.is(RoutineReceipt)(receipt) ||
    receipt.actorId !== member.userId ||
    receipt.householdId !== member.householdId
  )
    return false;
  if (action === "createRoutine") return receipt.action === "create";
  if (!("routineId" in input) || !matchesTarget(input.routineId, receipt.routineId)) return false;
  return action === "editRoutine"
    ? receipt.action === "edit"
    : "action" in input && receipt.action === input.action;
}

function matchesChoreChange(
  action: AssistantAction,
  input: object,
  receipt: object,
  member: Member,
) {
  if (
    !Schema.is(ChoreChangeReceipt)(receipt) ||
    !("occurrenceId" in input) ||
    !("expectedDueDate" in input)
  )
    return false;
  const dueDate = "newDueDate" in input ? input.newDueDate : input.expectedDueDate;
  return (
    matchesMember(receipt, member) &&
    matchesTarget(input.occurrenceId, receipt.occurrenceId) &&
    receipt.previousDueDate === input.expectedDueDate &&
    receipt.dueDate === dueDate &&
    receipt.action === (action === "skipChore" ? "skip" : "reschedule")
  );
}

function matchesMember(receipt: { actorId: string; householdId: string }, member: Member) {
  return receipt.actorId === member.userId && receipt.householdId === member.householdId;
}

function matchesRemoval(input: object, receipt: object, member: Member) {
  return (
    Schema.is(MemoryReceipt)(receipt) &&
    matchesPreferences(input, receipt, member) &&
    "memoryId" in input &&
    matchesTarget(input.memoryId, receipt.memoryId) &&
    receipt.removed
  );
}
