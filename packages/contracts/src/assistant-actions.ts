import { ExpenseInput } from "./expense.ts";
import { ExpenseApprovalEnvelope } from "./expense-approval.ts";
import {
  GenerateMealProposalInput,
  MealProposalGenerationReceipt,
  ReplaceProposalMealInput,
  ChooseProposalRecipeInput,
  MealProposalEdit,
  DiscardMealProposalInput,
  MealProposalDiscardReceipt,
} from "./meal-proposals.ts";
import { EditMealPreparationInput, MealPreparationEditReceipt } from "./meal-preparation-edit.ts";
import { CreateMealPreparationInput, MealPreparationReceipt } from "./meal-preparation.ts";
import { PlaceLeftoversInput, LeftoverPlacementReceipt } from "./meal-leftovers.ts";
import {
  PlaceRecipeInput,
  ReplaceWithRecipeInput,
  RecipePlacementReceipt,
  RecipeReplacementReceipt,
} from "./recipe-selection.ts";
import { EditRecipeInput, RecipeEditReceipt } from "./recipe-edit.ts";
import { ArchiveRecipeInput, RecipeArchiveReceipt } from "./recipe-archive.ts";
import { CreateRecipeInput, RecipeCreationReceipt } from "./recipe-creation.ts";
import { ReplaceMealInput, MealReplacementReceipt } from "./meal-replacement.ts";
import { MoveMealInput, MealMoveReceipt } from "./meal-move.ts";
import { RemoveMealInput, MealRemovalReceipt } from "./meal-removal.ts";
import { PlaceMealInput, MealPlacementReceipt } from "./meal-placement.ts";
import {
  RequestChoreTransfer,
  RespondChoreTransfer,
  ChoreTransferReceipt,
} from "./chore-transfers.ts";
import { SkipChoreReceipt, RescheduleChoreReceipt } from "./chore-changes.ts";
import {
  SkipChore,
  RescheduleChore,
  changedChoreDate,
  CreateRoutine,
  EditRoutine,
  RoutineReceipt,
  RoutineStateCommand,
} from "./routines.ts";
import { SaveNotificationPreferences, NotificationPreferenceReceipt } from "./notifications.ts";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { MemoryChange, MemoryApprovalEnvelope, RemoveMemory, MemoryReceipt } from "./memory.ts";
import { CompleteChore, Completion } from "./chores.ts";
import { SaveCookingPreferences, CookingPreferenceReceipt } from "./cooking.ts";
import { SaveFoodPreferences, FoodPreferenceReceipt } from "./food.ts";
import {
  AddGrocery,
  EditGrocery,
  RemoveGrocery,
  CheckGrocery,
  GroceryReceipt,
  GroceryCheckReceipt,
} from "./groceries.ts";

const MemoryProposalInput = Schema.Struct({
  ...MemoryChange.fields,
  memoryId: Schema.NullOr(MemoryChange.fields.memoryId),
}).check(
  Schema.makeFilter((input) => (input.memoryId === null) === (input.expectedRevision === "0")),
);
// The same field codecs as native commands; retry identities belong to the journal.
export const AssistantInputs = {
  proposeExpense: ExpenseInput,
  generateMealProposal: GenerateMealProposalInput,
  replaceProposalMeal: ReplaceProposalMealInput,
  chooseProposalRecipe: ChooseProposalRecipeInput,
  discardMealProposal: DiscardMealProposalInput,
  editMealPreparation: EditMealPreparationInput,
  createMealPreparation: CreateMealPreparationInput,
  placeLeftovers: PlaceLeftoversInput,
  placeRecipe: PlaceRecipeInput,
  replaceWithRecipe: ReplaceWithRecipeInput,
  editRecipe: EditRecipeInput,
  archiveRecipe: ArchiveRecipeInput,
  createRecipe: CreateRecipeInput,
  placeMeal: PlaceMealInput,
  removeMeal: RemoveMealInput,
  moveMeal: MoveMealInput,
  replaceMeal: ReplaceMealInput,
  requestChoreTransfer: Schema.Struct(Struct.omit(RequestChoreTransfer.fields, ["operationId"])),
  respondChoreTransfer: Schema.Struct(Struct.omit(RespondChoreTransfer.fields, ["operationId"])),
  skipChore: Schema.Struct(Struct.omit(SkipChore.fields, ["operationId"])),
  rescheduleChore: Schema.Struct(Struct.omit(RescheduleChore.fields, ["operationId"])).check(
    Schema.makeFilter(changedChoreDate),
  ),
  setRoutineState: Schema.Struct(Struct.omit(RoutineStateCommand.fields, ["operationId"])),
  editRoutine: Schema.Struct(Struct.omit(EditRoutine.fields, ["operationId"])),
  createRoutine: Schema.Struct(Struct.omit(CreateRoutine.fields, ["operationId"])),
  saveNotificationPreferences: Schema.Struct(
    Struct.omit(SaveNotificationPreferences.fields, ["operationId"]),
  ),
  proposeMemory: MemoryProposalInput,
  removeMemory: Schema.Struct(Struct.omit(RemoveMemory.fields, ["operationId"])),
  saveCookingPreferences: Schema.Struct(
    Struct.omit(SaveCookingPreferences.fields, ["operationId"]),
  ),
  saveFoodPreferences: Schema.Struct(Struct.omit(SaveFoodPreferences.fields, ["operationId"])),
  completeChore: Schema.Struct(Struct.omit(CompleteChore.fields, ["operationId"])),
  addGrocery: Schema.Struct(Struct.omit(AddGrocery.fields, ["operationId", "itemId"])),
  editGrocery: Schema.Struct(Struct.omit(EditGrocery.fields, ["operationId"])),
  removeGrocery: Schema.Struct(Struct.omit(RemoveGrocery.fields, ["operationId"])),
  checkGrocery: Schema.Struct(Struct.omit(CheckGrocery.fields, ["operationId"])),
};
export type AssistantAction = keyof typeof AssistantInputs;
export const AssistantReceipts = {
  proposeExpense: ExpenseApprovalEnvelope,
  generateMealProposal: MealProposalGenerationReceipt,
  replaceProposalMeal: MealProposalEdit.check(
    Schema.makeFilter((value) => value.status === "pending" && value.command.action === "replace"),
  ),
  chooseProposalRecipe: MealProposalEdit.check(
    Schema.makeFilter((value) => value.status === "pending" && value.command.action === "choose"),
  ),
  discardMealProposal: MealProposalDiscardReceipt,
  editMealPreparation: MealPreparationEditReceipt,
  createMealPreparation: MealPreparationReceipt,
  placeLeftovers: LeftoverPlacementReceipt,
  placeRecipe: RecipePlacementReceipt,
  replaceWithRecipe: RecipeReplacementReceipt,
  editRecipe: RecipeEditReceipt,
  archiveRecipe: RecipeArchiveReceipt,
  createRecipe: RecipeCreationReceipt,
  placeMeal: MealPlacementReceipt,
  removeMeal: MealRemovalReceipt,
  moveMeal: MealMoveReceipt,
  replaceMeal: MealReplacementReceipt,
  requestChoreTransfer: ChoreTransferReceipt.check(
    Schema.makeFilter((value) => value.action === "request"),
  ),
  respondChoreTransfer: ChoreTransferReceipt.check(
    Schema.makeFilter((value) => value.action !== "request"),
  ),
  skipChore: SkipChoreReceipt,
  rescheduleChore: RescheduleChoreReceipt,
  setRoutineState: Schema.Struct({
    ...RoutineReceipt.fields,
    action: RoutineStateCommand.fields.action,
  }),
  editRoutine: Schema.Struct({ ...RoutineReceipt.fields, action: Schema.Literal("edit") }),
  createRoutine: Schema.Struct({ ...RoutineReceipt.fields, action: Schema.Literal("create") }),
  saveNotificationPreferences: NotificationPreferenceReceipt,
  proposeMemory: MemoryApprovalEnvelope,
  removeMemory: MemoryReceipt,
  saveCookingPreferences: CookingPreferenceReceipt,
  saveFoodPreferences: FoodPreferenceReceipt,
  completeChore: Completion,
  addGrocery: GroceryReceipt,
  editGrocery: GroceryReceipt,
  removeGrocery: GroceryReceipt,
  checkGrocery: GroceryCheckReceipt,
};
export const CommandRejection = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.Literals(["conflict", "forbidden"]),
});
