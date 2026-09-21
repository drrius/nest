import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MoneyCategoriesQuery,
  MoneyCategories,
  MoneyCategoryQuery,
} from "@nest/contracts/money-category";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const Row = Schema.Struct({
  categoryId: MoneyCategoryQuery.fields.categoryId,
  householdId: MoneyCategories.fields.householdId,
  name: Schema.NonEmptyString,
  archivedAt: Schema.Null,
});
export function readMoneyCategories(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(MoneyCategoriesQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const householdId = caller.member.householdId,
      after = query.after?.toLowerCase() ?? null;
    const params = new URLSearchParams({
      select: "categoryId:id,householdId:household_id,name,archivedAt:archived_at",
      household_id: `eq.${householdId}`,
      archived_at: "is.null",
      order: "id.asc",
      limit: "51",
    });
    if (after) params.set("id", `gt.${after}`);
    const raw = yield* requestJson(config, caller.token, `rest/v1/expense_categories?${params}`);
    const rows = yield* Schema.decodeUnknownEffect(Schema.Array(Row).check(Schema.isMaxLength(51)))(
      raw,
      { onExcessProperty: "error" },
    ).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      rows.some(
        (row, index) =>
          row.householdId !== householdId ||
          row.categoryId <= (rows[index - 1]?.categoryId ?? after ?? ""),
      )
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const categories = rows
      .slice(0, 50)
      .map((row) => ({ categoryId: row.categoryId, name: row.name, archived: false }));
    return {
      version: 1 as const,
      householdId,
      after,
      categories,
      next: rows.length > 50 ? categories.at(-1)!.categoryId : null,
    };
  });
}
