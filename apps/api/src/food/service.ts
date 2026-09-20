import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { FoodPreferences, FoodPreferenceReceipt, SaveFoodPreferences } from "@nest/contracts/food";
import { ConversationRevision } from "@nest/contracts/conversations";
import { ApiFailure } from "../errors.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const Row = Schema.Struct({
  ...FoodPreferences.fields,
  actorId: Schema.String,
  householdId: Schema.String,
  revision: ConversationRevision,
});
const decode = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: ApiFailure["code"] = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function foodPreferences(config: IdentityConfig, caller: AuthorizedCaller) {
  const { userId: actorId, householdId } = caller.member;
  return {
    read: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select:
            "actorId:actor_id,householdId:household_id,revision:revision::text,restrictions,dislikes,calorieGoal:calorie_goal,portions",
          actor_id: `eq.${actorId}`,
          household_id: `eq.${householdId}`,
          limit: "1",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_food_profiles?${query}`,
        );
        const rows = yield* decode(Schema.Array(Row), document.value);
        if (rows.length === 0 && document.range === "*/0") return null;
        const row = yield* decode(Row, rows[0]);
        if (
          rows.length !== 1 ||
          document.range !== "0-0/1" ||
          row.actorId !== actorId ||
          row.householdId !== householdId ||
          row.revision === "0"
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return {
          revision: row.revision,
          preferences: {
            restrictions: row.restrictions,
            dislikes: row.dislikes,
            calorieGoal: row.calorieGoal,
            portions: row.portions,
          },
        };
      }),
    save: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(SaveFoodPreferences, input, "invalid_request");
        const prefs = command.preferences;
        const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_save_food_profile", {
          p_household: householdId,
          p_operation: command.operationId.toLowerCase(),
          p_expected: command.expectedRevision,
          p_restrictions: prefs.restrictions,
          p_dislikes: prefs.dislikes,
          p_calorie_goal: prefs.calorieGoal,
          p_portions: prefs.portions,
        });
        const receipt = yield* decode(FoodPreferenceReceipt, raw);
        if (
          receipt.actorId !== actorId ||
          receipt.householdId !== householdId ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.revision !== String(BigInt(command.expectedRevision) + 1n)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}
