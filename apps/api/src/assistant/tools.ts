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
) {
  const headers = new Headers(request.headers);
  headers.set("x-nest-household", scope.householdId);
  const bound = new Request(request.url, { headers, signal: request.signal });
  const chores = choreTools(bound, config),
    groceries = groceryTools(bound, config);
  const execute = assistantCommands(bound, config, scope.turn);
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
    readMemories: readMemoriesTool(bound, config),
    readCookingPreferences: readCookingPreferencesTool(bound, config),
    readFoodPreferences: readFoodPreferencesTool(bound, config),
    listChores: chores.listChores,
    listGroceries: groceries.listGroceries,
    listGroceryCategories: groceries.listGroceryCategories,
    ...writeTools(write),
  };
  return {
    tools,
    rejectInvalidCall: () => {
      halted = true;
    },
  };
}
