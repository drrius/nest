import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MemberColourChoice,
  MemberColourReceipt,
  SaveMemberColour,
} from "@nest/contracts/member-colours";
import { ApiFailure } from "../errors.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const Row = Schema.Struct({ ...MemberColourChoice.fields, householdId: Schema.String });
const decode = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: ApiFailure["code"] = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function memberColours(config: IdentityConfig, caller: AuthorizedCaller) {
  const { userId: actorId, householdId } = caller.member;
  return {
    read: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select: "actorId:actor_id,householdId:household_id,colour,revision:revision::text",
          household_id: `eq.${householdId}`,
          order: "actor_id.asc",
          limit: "3",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_member_colours?${query}`,
        );
        const rows = yield* decode(Schema.Array(Row).check(Schema.isMaxLength(2)), document.value);
        const range = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
        if (
          document.range !== range ||
          new Set(rows.map((row) => row.actorId)).size !== rows.length ||
          new Set(rows.map((row) => row.colour)).size !== rows.length ||
          rows.some((row) => row.householdId !== householdId)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return rows.map(({ actorId, colour, revision }) => ({ actorId, colour, revision }));
      }),
    save: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(SaveMemberColour, input, "invalid_request");
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_save_member_colour",
          {
            p_household: householdId,
            p_operation: command.operationId.toLowerCase(),
            p_expected: command.expectedRevision,
            p_colour: command.colour,
          },
        );
        const receipt = yield* decode(MemberColourReceipt, raw);
        if (
          receipt.actorId !== actorId ||
          receipt.householdId !== householdId ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.colour !== command.colour ||
          receipt.revision !== String(BigInt(command.expectedRevision) + 1n)
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}
