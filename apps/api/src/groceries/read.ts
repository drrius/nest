import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Grocery, GroceryCategory, Uuid } from "@nest/contracts/groceries";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { requestDocument } from "../supabase-request.ts";

const GroceryRow = Schema.Struct({
  ...Grocery.fields,
  householdId: Uuid,
  legacyState: Schema.Literals(["active", "claimed"]),
  legacyClaimed: Schema.optionalKey(Schema.Boolean),
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
        const query = new URLSearchParams({
          select:
            "itemId:id,householdId:household_id,name,quantity,unit,categoryId:category_id,version:native_version::text,checked:native_checked,legacyState:state",
          household_id: `eq.${caller.member.householdId}`,
          state: "in.(active,claimed)",
          order: "sort_order.asc,created_at.asc,id.asc",
          limit: "501",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/grocery_items?${query}`,
        );
        const rows = yield* bounded(Schema.Array(GroceryRow), document, 500);
        if (
          rows.some((row) => row.householdId !== caller.member.householdId) ||
          new Set(rows.map((row) => row.itemId)).size !== rows.length
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return rows.map(({ householdId: _household, legacyState, ...row }) => ({
          ...row,
          legacyClaimed: legacyState === "claimed",
        }));
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
