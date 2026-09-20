import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  AddGrocery,
  EditGrocery,
  RemoveGrocery,
  CheckGrocery,
  GroceryReceipt,
  GroceryCheckReceipt,
} from "@nest/contracts/groceries";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { requestJson } from "../supabase-request.ts";

function decode<A>(schema: Schema.Codec<A>, input: unknown, code: ApiFailure["code"]) {
  return Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
}
export function groceryCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const edit = (action: "add" | "edit" | "remove", input: unknown) =>
    Effect.gen(function* () {
      const schema: Schema.Codec<
        typeof AddGrocery.Type | typeof EditGrocery.Type | typeof RemoveGrocery.Type
      > = action === "add" ? AddGrocery : action === "edit" ? EditGrocery : RemoveGrocery;
      const command = yield* decode(schema, input, "invalid_request");
      const target = command.itemId.toLowerCase(),
        operation = command.operationId.toLowerCase();
      const raw = yield* requestJson(
        config,
        caller.token,
        "rest/v1/rpc/nest_edit_grocery",
        editPayload(action, command, caller.member.householdId),
      );
      const receipt = yield* decode(GroceryReceipt, raw, "unavailable");
      if (
        receipt.operation !== operation ||
        receipt.target !== target ||
        receipt.removed !== (action === "remove")
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    add: (input: unknown) => edit("add", input),
    edit: (input: unknown) => edit("edit", input),
    remove: (input: unknown) => edit("remove", input),
    check: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(CheckGrocery, input, "invalid_request");
        const target = command.itemId.toLowerCase(),
          operation = command.operationId.toLowerCase();
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_set_grocery_checked",
          {
            p_household: caller.member.householdId,
            p_operation: operation,
            p_target: target,
            p_expected: command.expectedVersion,
            p_checked: command.checked,
          },
        );
        const receipt = yield* decode(GroceryCheckReceipt, raw, "unavailable");
        if (
          receipt.operation !== operation ||
          receipt.target !== target ||
          receipt.checked !== command.checked
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}

function editPayload(
  action: "add" | "edit" | "remove",
  command: typeof AddGrocery.Type | typeof EditGrocery.Type | typeof RemoveGrocery.Type,
  household: string,
) {
  return {
    p_household: household,
    p_operation: command.operationId.toLowerCase(),
    p_target: command.itemId.toLowerCase(),
    p_action: action,
    p_expected: "expectedVersion" in command ? command.expectedVersion : null,
    p_name: "name" in command ? command.name : null,
    p_quantity: "quantity" in command ? command.quantity : null,
    p_unit: "unit" in command ? command.unit : null,
    p_category: "categoryId" in command ? (command.categoryId?.toLowerCase() ?? null) : null,
  };
}
