import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoneyCategoryQuery, MoneyCategoryEnvelope } from "@nest/contracts/money-category";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const Row = Schema.Struct({
  categoryId: MoneyCategoryQuery.fields.categoryId,
  householdId: MoneyCategoryEnvelope.fields.householdId,
  name: Schema.NonEmptyString,
  archivedAt: Schema.NullOr(Schema.String),
});
export function readMoneyCategory(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(MoneyCategoryQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const categoryId = query.categoryId.toLowerCase(),
      householdId = caller.member.householdId;
    const params = new URLSearchParams({
      select: "categoryId:id,householdId:household_id,name,archivedAt:archived_at",
      id: `eq.${categoryId}`,
      household_id: `eq.${householdId}`,
      limit: "2",
    });
    const raw = yield* requestJson(config, caller.token, `rest/v1/expense_categories?${params}`);
    const rows = yield* Schema.decodeUnknownEffect(Schema.Array(Row))(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      rows.length > 1 ||
      rows.some((row) => row.categoryId !== categoryId || row.householdId !== householdId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const row = rows[0];
    return {
      version: 1 as const,
      householdId,
      categoryId,
      category: row ? { categoryId, name: row.name, archived: row.archivedAt !== null } : null,
    };
  });
}
