import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Grocery, GroceryCategory, GroceryMealSource, Uuid } from "@nest/contracts/groceries";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";

const GroceryRow = Schema.Struct({
  ...Grocery.fields,
  mealSource: Schema.NullOr(Schema.Struct({ ...GroceryMealSource.fields, householdId: Uuid })),
  category: Schema.NullOr(
    Schema.Struct({
      ...GroceryCategory.fields,
      householdId: Uuid,
      archivedAt: Schema.NullOr(Schema.String),
    }),
  ),
  householdId: Uuid,
  legacyState: Schema.Literals(["active", "claimed"]),
  legacyClaimed: Schema.optionalKey(Schema.Boolean),
});
const Snapshot = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  total: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  items: Schema.Array(GroceryRow),
});
const CategoryRow = Schema.Struct({ ...GroceryCategory.fields, householdId: Uuid });
function bounded<A>(
  schema: Schema.Codec<ReadonlyArray<A>>,
  document: { value: unknown; range: string | undefined },
  limit: number,
) {
  return Schema.decodeUnknownEffect(schema)(document.value).pipe(
    Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    Effect.flatMap((rows) => {
      const expected = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
      return rows.length > limit || document.range !== expected
        ? Effect.fail(new ApiFailure({ code: "unavailable" }))
        : Effect.succeed(rows);
    }),
  );
}
export function groceryReads(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: () =>
      Effect.gen(function* () {
        const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_grocery_snapshot", {
          p_household: caller.member.householdId,
        });
        const snapshot = yield* Schema.decodeUnknownEffect(Snapshot)(raw, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
        const rows = snapshot.items;
        if (snapshot.householdId !== caller.member.householdId || snapshot.total !== rows.length)
          return yield* new ApiFailure({ code: "unavailable" });
        if (
          rows.some(
            (row) =>
              row.householdId !== caller.member.householdId ||
              !matchesCategory(row) ||
              !matchesMeal(row),
          ) ||
          new Set(rows.map((row) => row.itemId)).size !== rows.length
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return rows.map(
          ({ householdId: _household, legacyState, category, mealSource, ...row }) => ({
            ...row,
            mealSource: mealSource
              ? {
                  entryId: mealSource.entryId,
                  title: mealSource.title,
                  date: mealSource.date,
                  slot: mealSource.slot,
                }
              : null,
            categoryName: category?.archivedAt === null ? category.name : null,
            legacyClaimed: legacyState === "claimed",
          }),
        );
      }),
    categories: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select: "categoryId:id,householdId:household_id,name",
          household_id: `eq.${caller.member.householdId}`,
          archived_at: "is.null",
          order: "sort_order.asc,id.asc",
          limit: "101",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/grocery_categories?${query}`,
        );
        const rows = yield* bounded(Schema.Array(CategoryRow), document, 100);
        if (
          rows.some((row) => row.householdId !== caller.member.householdId) ||
          new Set(rows.map((row) => row.categoryId)).size !== rows.length
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return rows.map(({ householdId: _household, ...row }) => row);
      }),
  };
}

function matchesCategory(row: typeof GroceryRow.Type) {
  return (
    row.category === null ||
    (row.category.householdId === row.householdId && row.category.categoryId === row.categoryId)
  );
}

function matchesMeal(row: typeof GroceryRow.Type) {
  return row.mealSource === null || row.mealSource.householdId === row.householdId;
}
