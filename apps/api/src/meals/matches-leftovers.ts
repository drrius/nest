import * as Schema from "effect/Schema";
import { PlaceLeftoversInput, LeftoverPlacementReceipt } from "@nest/contracts/meal-leftovers";
export function matchesLeftovers(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(PlaceLeftoversInput)(input) || !Schema.is(LeftoverPlacementReceipt)(receipt))
    return false;
  const delta = input.sourceWeekStart === input.targetWeekStart ? 1n : 0n;
  return (
    matchesIdentity(input, receipt, member) &&
    receipt.sourceWeekStart === input.sourceWeekStart &&
    receipt.targetWeekStart === input.targetWeekStart &&
    receipt.date === input.date &&
    receipt.slot === input.slot &&
    BigInt(receipt.sourceRevision) === BigInt(input.expectedSourceRevision) + delta &&
    BigInt(receipt.targetRevision) === BigInt(input.expectedTargetRevision) + 1n
  );
}

function matchesIdentity(
  input: PlaceLeftoversInput,
  receipt: LeftoverPlacementReceipt,
  member: { userId: string; householdId: string },
) {
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.sourceEntryId === input.entryId.toLowerCase()
  );
}
