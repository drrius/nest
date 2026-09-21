import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ReadMealIngredients,
  MealIngredientPage,
  AddMealIngredients,
  MealIngredientsReceipt,
  sourceKey,
} from "@nest/contracts/meal-ingredients";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const decode = <A>(
  schema: Schema.Codec<A>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function readMealIngredients(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* decode(ReadMealIngredients, input, "invalid_request");
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_meal_ingredients", {
      p_household: caller.member.householdId,
      p_week: query.weekStart,
      p_revision: query.expectedRevision,
      p_after: query.after,
    });
    const page = yield* decode(MealIngredientPage, raw, "unavailable");
    if (
      page.householdId !== caller.member.householdId ||
      page.weekStart !== query.weekStart ||
      page.revision !== query.expectedRevision
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const after = query.after;
    if (after && page.ingredients.some((row) => sourceKey(row) <= sourceKey(after)))
      return yield* new ApiFailure({ code: "unavailable" });
    return page;
  });
}
export function addMealIngredients(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const parsed = yield* decode(AddMealIngredients, input, "invalid_request");
    const command = {
      ...parsed,
      operationId: parsed.operationId.toLowerCase(),
      selected: parsed.selected.map((row) => ({
        ...row,
        entryId: row.entryId.toLowerCase(),
        ingredientId: row.ingredientId.toLowerCase(),
      })),
    };
    const { operationId, ...value } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_add_meal_ingredients", {
      p_household: caller.member.householdId,
      p_operation: operationId,
      p_input: value,
    });
    const receipt = yield* decode(MealIngredientsReceipt, raw, "unavailable");
    if (!matchesReceipt(receipt, command, caller))
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
function matchesReceipt(
  receipt: MealIngredientsReceipt,
  command: AddMealIngredients,
  caller: AuthorizedCaller,
) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === command.operationId &&
    receipt.weekStart === command.weekStart &&
    receipt.weekRevision === command.expectedRevision &&
    receipt.ingredients.length === command.selected.length &&
    receipt.ingredients.every(
      (row, index) => sourceKey(row) === sourceKey(command.selected[index]!),
    )
  );
}
export function mealIngredientsRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    const adding = url.pathname === "/v1/meals/ingredients/add";
    const input = yield* commandBody(request, adding ? 8388608 : 8192);
    return adding
      ? { version: 1, receipt: yield* addMealIngredients(config, caller, input) }
      : yield* readMealIngredients(config, caller, input);
  });
}
