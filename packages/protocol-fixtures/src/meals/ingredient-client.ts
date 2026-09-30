import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ReadMealIngredients,
  MealIngredientPage,
  AddMealIngredients,
  MealIngredientsReceipt,
  sourceKey,
} from "@nest/contracts/meal-ingredients";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import { matchesIngredientReceipt } from "./ingredient-draft.ts";
const Added = Schema.Struct({ version: Schema.Literal(1), receipt: MealIngredientsReceipt });
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function mealIngredientClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return {
    read: (input: typeof ReadMealIngredients.Type) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealIngredients)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const page = yield* request("v1/meals/ingredients/read", MealIngredientPage, query);
        if (page.householdId !== account.household)
          return yield* new PreferenceFailure({ code: "forbidden" });
        const after = query.after;
        if (
          page.weekStart !== query.weekStart ||
          page.revision !== query.expectedRevision ||
          (after && page.ingredients.some((row) => sourceKey(row) <= sourceKey(after)))
        )
          return yield* unavailable();
        return page;
      }),
    add: (input: AddMealIngredients) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(AddMealIngredients)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const { receipt } = yield* request("v1/meals/ingredients/add", Added, command);
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          !matchesIngredientReceipt(receipt, command)
        )
          return yield* unavailable();
        return receipt;
      }),
  };
}
