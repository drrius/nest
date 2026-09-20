import { CreateRoutine, RoutineReceipt } from "./routines.ts";
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
