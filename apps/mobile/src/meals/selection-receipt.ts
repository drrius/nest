import type { PlaceRecipe, RecipePlacementReceipt } from "@nest/contracts/recipe-selection";
export function matchesSelection(
  command: PlaceRecipe,
  receipt: RecipePlacementReceipt,
  member: { actor: string; household: string },
  delta: 1 | 2,
) {
  return (
    receipt.actorId === member.actor &&
    receipt.householdId === member.household &&
    receipt.operationId === command.operationId.toLowerCase() &&
    matchesTarget(command, receipt) &&
    BigInt(receipt.revision) === BigInt(command.expectedRevision) + BigInt(delta)
  );
}
function matchesTarget(command: PlaceRecipe, receipt: RecipePlacementReceipt) {
  return (
    receipt.weekStart === command.weekStart &&
    receipt.date === command.date &&
    receipt.slot === command.slot &&
    receipt.definitionId === command.definitionId.toLowerCase() &&
    receipt.libraryRevision === command.expectedLibraryRevision
  );
}
