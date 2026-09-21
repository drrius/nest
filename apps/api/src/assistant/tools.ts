import { moneyTools } from "../money/tools.ts";
import { proposalReadTools, proposalWriteTools } from "../meal-planning/assistant-tools.ts";
import { planningCommands } from "../meal-planning/assistant-execution.ts";
import type { MealPlanningOptions } from "../meal-planning/route.ts";
import { readHouseholdRosterTool } from "../routines/roster-tool.ts";
import { mealLibraryTools } from "../meals/library-tools.ts";
import { mealIngredientTools } from "../meals/ingredient-tools.ts";
import { mealWriteTools } from "../meals/write-tools.ts";
import { readMealWeekTool } from "../meals/tools.ts";
import { readChoreTransfersTool } from "../chores/transfer-tool.ts";
import { readRoutinesTool } from "../routines/tools.ts";
import { setupTools } from "../setup/tools.ts";
import { readNotificationPreferencesTool } from "../notifications/tools.ts";
import { calendarTools } from "../calendar/tools.ts";
import { writeTools } from "./write-tools.ts";
import { readMemoriesTool } from "../memory/tools.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { AssistantInputs, type AssistantAction } from "@nest/contracts/assistant-actions";
import { CommandFailure, effectTool } from "@nest/ai/tool";
import type { StartTurn } from "@nest/contracts/conversations";
import type { IdentityConfig } from "../supabase-identity.ts";
import { choreTools } from "../chores/tools.ts";
import { groceryTools } from "../groceries/tools.ts";
import { assistantCommands } from "./commands.ts";
import { readCookingPreferencesTool } from "../cooking/tools.ts";
import { readFoodPreferencesTool } from "../food/tools.ts";

export function householdTools(
  request: Request,
  config: IdentityConfig,
  scope: { householdId: string; turn: StartTurn },
  planning: MealPlanningOptions = {},
) {
  const headers = new Headers(request.headers);
  headers.set("x-nest-household", scope.householdId);
  const bound = new Request(request.url, { headers, signal: request.signal });
  const chores = choreTools(bound, config),
    groceries = groceryTools(bound, config);
  const execute = planningCommands(
    bound,
    config,
    assistantCommands(bound, config, scope.turn),
    planning,
  );
  const semaphore = Semaphore.makeUnsafe(1);
  let halted = false;
  const write = (name: AssistantAction, description: string) => {
    const input: Schema.ConstraintCodec<object, unknown, never, never> = AssistantInputs[name];
    return effectTool({
      description,
      input,
      execute: (input, invocation) =>
        semaphore.withPermit(
          Effect.suspend(() =>
            halted
              ? Effect.fail(new CommandFailure({ code: "unavailable" }))
              : execute(name, input, invocation.toolCallId).pipe(
                  Effect.onError(() =>
                    Effect.sync(() => {
                      halted = true;
                    }),
                  ),
                ),
          ),
        ),
    });
  };
  const tools = {
    ...proposalReadTools(bound, config),
    ...proposalWriteTools(write),
    ...calendarTools(bound, config),
    ...moneyTools(bound, config),
    proposeSettlement: write(
      "proposeSettlement",
      "Propose only a settlement the member explicitly asked to record. Read the current Money balance first. Bind its exact positive outstanding CHF centime string, current debtor as payer and creditor as recipient. Full mode uses exactly that amount; partial mode needs an explicit positive amount no larger than the outstanding balance. Ask for missing date or amount; never invent member IDs. This creates a private proposal and posts no money. Confirmation is a separate native action; never infer consent or call native Save/decision endpoints. A changed balance requires fresh review. This records an entered settlement, never initiates or proves a bank transfer.",
    ),
    proposeExpense: write(
      "proposeExpense",
      "Propose only an expense the member explicitly asked to record. Read household member IDs first; never invent them. Ask for missing amount, payer, date or split. Use exact CHF centime strings and exactly two member allocations summing to the amount; equal splits assign an odd centime to the payer. Category is null unless a current category ID is known; note is null when absent. This creates a private pending proposal and posts no money. Tell the member to open the expense approval and confirm its exact amount, payer and allocations. Never claim it is posted, infer consent from conversation, or try to approve or execute it yourself. For an explicitly requested grocery expense, ask separately for the receipt total and shared amount. Set receiptTotalCentimes to the explicit total and amountCentimes to the shared amount, with allocations summing only to that shared amount. The shared amount cannot exceed the total. Omit receiptTotalCentimes for ordinary expenses. Checking groceries never implies an expense or provides either amount. Receipt selection requires a native handoff and is not included in this proposal.",
    ),
    ...setupTools(bound, config),
    readChoreTransfers: readChoreTransfersTool(bound, config),
    readMealWeek: readMealWeekTool(bound, config),
    ...mealLibraryTools(bound, config),
    ...mealIngredientTools(bound, config),
    readRoutines: readRoutinesTool(bound, config),
    readHouseholdRoster: readHouseholdRosterTool(bound, config),
    readNotificationPreferences: readNotificationPreferencesTool(bound, config),
    readMemories: readMemoriesTool(bound, config),
    readCookingPreferences: readCookingPreferencesTool(bound, config),
    readFoodPreferences: readFoodPreferencesTool(bound, config),
    listChores: chores.listChores,
    listGroceries: groceries.listGroceries,
    listGroceryCategories: groceries.listGroceryCategories,
    ...writeTools(write),
    ...mealWriteTools(write),
  };
  return {
    tools,
    rejectInvalidCall: () => {
      halted = true;
    },
  };
}
