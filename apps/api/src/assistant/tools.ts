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
  return {
    listChores: chores.listChores,
    listGroceries: groceries.listGroceries,
    listGroceryCategories: groceries.listGroceryCategories,
    completeChore: write(
      "completeChore",
      "Complete only a chore the member asked to finish. Read its occurrence ID and due date first; use the member's completion date, asking if unclear. Does not affect money.",
    ),
    addGrocery: write(
      "addGrocery",
      "Add only a requested grocery. Optional quantity, unit and category are null when absent. The server retains retry identity. Does not post money.",
    ),
    editGrocery: write(
      "editGrocery",
      "Edit a requested grocery using its exact read version. Preserve all description fields the member did not ask to change.",
    ),
    removeGrocery: write(
      "removeGrocery",
      "Remove only a requested grocery using its exact read version. Claimed legacy items require native reconciliation.",
    ),
    checkGrocery: write(
      "checkGrocery",
      "Set a requested grocery's checked state using its exact read version. Does not create a purchase or expense.",
    ),
  };
}
