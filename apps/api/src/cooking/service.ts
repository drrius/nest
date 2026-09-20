import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CookingPreferences,
  CookingPreferenceReceipt,
  SaveCookingPreferences,
  CookingProfile,
} from "@nest/contracts/cooking";
import { ApiFailure } from "../errors.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const Row = Schema.Struct({
  ...CookingPreferences.fields,
  householdId: Schema.String,
  revision: CookingProfile.fields.revision,
});
const decode = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: ApiFailure["code"] = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function cookingPreferences(config: IdentityConfig, caller: AuthorizedCaller) {
  const { userId: actorId, householdId } = caller.member;
  return {
    read: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select:
            "householdId:household_id,revision:revision::text,cookingNotes:cooking_notes,mealSlots:meal_slots",
          household_id: `eq.${householdId}`,
          limit: "1",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_cooking_preferences?${query}`,
        );
        const rows = yield* decode(Schema.Array(Row), document.value);
        if (!rows.length && document.range === "*/0") return null;
        const row = yield* decode(Row, rows[0]);
        if (
          rows.length !== 1 ||
          document.range !== "0-0/1" ||
          row.householdId !== householdId ||
          row.revision === "0"
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return {
          revision: row.revision,
          preferences: { cookingNotes: row.cookingNotes, mealSlots: row.mealSlots },
        };
      }),
    save: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(SaveCookingPreferences, input, "invalid_request");
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_save_cooking_preferences",
          {
            p_household: householdId,
            p_operation: command.operationId.toLowerCase(),
            p_expected: command.expectedRevision,
            p_notes: command.preferences.cookingNotes,
            p_slots: command.preferences.mealSlots,
          },
        );
        const receipt = yield* decode(CookingPreferenceReceipt, raw);
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
