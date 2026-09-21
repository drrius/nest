import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import {
  MoneyCategoryQuery,
  MoneyCategoryEnvelope,
  MoneyCategoriesQuery,
  MoneyCategories,
} from "@nest/contracts/money-category";
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function expenseCategoryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = <A extends { householdId: string }>(path: string, schema: Schema.Codec<A>) =>
    request(path, schema).pipe(
      Effect.filterOrFail(
        (value) => value.householdId === account.household,
        () => new PreferenceFailure({ code: "forbidden" }),
      ),
    );
  return {
    categories: (cursor: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(MoneyCategoriesQuery)({
          after: cursor,
        }).pipe(Effect.mapError(invalid));
        const after = query.after?.toLowerCase() ?? null;
        const params = new URLSearchParams();
        if (after) params.set("after", after);
        const result = yield* scoped(`v1/money/categories?${params}`, MoneyCategories);
        if (result.after !== after) return yield* unavailable();
        return result;
      }),
    category: (categoryId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(MoneyCategoryQuery)({ categoryId }).pipe(
          Effect.mapError(invalid),
        );
        const target = query.categoryId.toLowerCase();
        const result = yield* scoped(
          `v1/money/category?${new URLSearchParams({ categoryId: target })}`,
          MoneyCategoryEnvelope,
        );
        if (result.categoryId !== target) return yield* unavailable();
        return result.category;
      }),
  };
}
