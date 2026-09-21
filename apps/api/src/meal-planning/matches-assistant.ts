import * as Schema from "effect/Schema";
import {
  GenerateMealProposalInput,
  MealProposalGenerationReceipt,
  DiscardMealProposalInput,
  MealProposalDiscardReceipt,
  ReplaceProposalMealInput,
  ChooseProposalRecipeInput,
  MealProposalEdit,
} from "@nest/contracts/meal-proposals";
type Member = { userId: string; householdId: string };
export function matchesProposalAction(
  action: string,
  input: object,
  receipt: object,
  member: Member,
): boolean | null {
  if (action === "generateMealProposal") return matchesGeneration(input, receipt, member);
  if (action === "discardMealProposal") return matchesDiscard(input, receipt, member);
  if (action === "replaceProposalMeal" || action === "chooseProposalRecipe")
    return matchesEdit(action, input, receipt, member);
  return null;
}
function owned(receipt: { actorId: string; householdId: string }, member: Member) {
  return receipt.actorId === member.userId && receipt.householdId === member.householdId;
}
function matchesGeneration(input: object, receipt: object, member: Member) {
  return (
    Schema.is(GenerateMealProposalInput)(input) &&
    Schema.is(MealProposalGenerationReceipt)(receipt) &&
    owned(receipt, member) &&
    receipt.weekStart === input.weekStart &&
    receipt.expectedWeekRevision === input.expectedWeekRevision &&
    receipt.familiarOnly === input.familiarOnly
  );
}
function matchesDiscard(input: object, receipt: object, member: Member) {
  return (
    Schema.is(DiscardMealProposalInput)(input) &&
    Schema.is(MealProposalDiscardReceipt)(receipt) &&
    owned(receipt, member) &&
    receipt.proposalId === input.proposalId.toLowerCase() &&
    receipt.previousRevision === input.expectedRevision
  );
}
function matchesEdit(action: string, input: object, receipt: object, member: Member) {
  if (
    !Schema.is(MealProposalEdit)(receipt) ||
    !owned(receipt, member) ||
    receipt.status !== "pending"
  )
    return false;
  if (!Schema.is(ReplaceProposalMealInput)(input)) return false;
  const command = receipt.command;
  if (
    command.proposalId !== input.proposalId.toLowerCase() ||
    command.entryId !== input.entryId.toLowerCase() ||
    command.expectedRevision !== input.expectedRevision
  )
    return false;
  if (action === "replaceProposalMeal") return command.action === "replace";
  return matchesChoice(input, command);
}
function matchesChoice(input: object, command: MealProposalEdit["command"]) {
  return (
    Schema.is(ChooseProposalRecipeInput)(input) &&
    command.action === "choose" &&
    command.definitionId === input.definitionId.toLowerCase() &&
    command.expectedLibraryRevision === input.expectedLibraryRevision
  );
}
