import type { ApiFailure } from "../errors.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CommandFailure, effectTool } from "@nest/ai/tool";
import { AddGrocery, EditGrocery, RemoveGrocery, CheckGrocery } from "@nest/contracts/groceries";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { validateConfig } from "../config.ts";
import { groceryCommands } from "./service.ts";
import { groceryReads } from "./read.ts";

export function groceryTools(request: Request, config: IdentityConfig) {
  const validated = validateConfig(config);
  const authorized = Effect.gen(function* () {
    const member = yield* currentMember(request),
      token = yield* bearerToken(request);
    return {
      ...groceryCommands(validated, { member, token }),
      ...groceryReads(validated, { member, token }),
    };
  }).pipe(Effect.provide(supabaseIdentity(validated)));
  const execute = (
    action: "list" | "categories" | "add" | "edit" | "remove" | "check",
    input: unknown,
  ) =>
    authorized.pipe(
      Effect.flatMap((commands): Effect.Effect<unknown, ApiFailure> => commands[action](input)),
      Effect.mapError(
        (error) =>
          new CommandFailure({
            code:
              error.code === "unavailable"
                ? "unavailable"
                : error.code === "conflict" || error.code === "removed"
                  ? "conflict"
                  : "forbidden",
          }),
      ),
    );
  return {
    listGroceries: effectTool({
      description: "Read the household grocery checklist with exact versions before changing it.",
      input: Schema.Struct({}),
      execute: (input) => execute("list", input),
    }),
    listGroceryCategories: effectTool({
      description: "Read available household grocery categories.",
      input: Schema.Struct({}),
      execute: (input) => execute("categories", input),
    }),
    addGrocery: effectTool({
      description:
        "Add a requested grocery with stable new item and operation UUIDs retained for retries. Optional quantity/unit/category are null when absent. Does not post money.",
      input: AddGrocery,
      execute: (input) => execute("add", input),
    }),
    editGrocery: effectTool({
      description:
        "Edit requested grocery description fields using the exact version read. Preserve fields the member did not request changing. Does not change checked state or money.",
      input: EditGrocery,
      execute: (input) => execute("edit", input),
    }),
    removeGrocery: effectTool({
      description:
        "Remove a requested grocery using its exact current version. Retain operation UUID for retries. A legacy claimed item needs reconciliation; do not release shopping sessions.",
      input: RemoveGrocery,
      execute: (input) => execute("remove", input),
    }),
    checkGrocery: effectTool({
      description:
        "Set the requested grocery checked state with its exact read version and a stable retry UUID. This never creates a purchase or expense.",
      input: CheckGrocery,
      execute: (input) => execute("check", input),
    }),
  };
}
