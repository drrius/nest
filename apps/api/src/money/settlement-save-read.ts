import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SettlementSaveQuery, SettlementSaveResult } from "@nest/contracts/settlement-save-read";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export const readSettlementSave = (
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) => settlementSaveOperation(config, caller, input, "nest_read_settlement_save");
export const cancelSettlementSave = (
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) =>
  settlementSaveOperation(config, caller, input, "nest_cancel_settlement_save").pipe(
    Effect.flatMap((result) =>
      result.status === "unresolved"
        ? Effect.fail(new ApiFailure({ code: "unavailable" }))
        : Effect.succeed(result),
    ),
  );
function settlementSaveOperation(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
  rpc: "nest_read_settlement_save" | "nest_cancel_settlement_save",
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(SettlementSaveQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const operationId = query.operationId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, `rest/v1/rpc/${rpc}`, {
      p_household: caller.member.householdId,
      p_operation: operationId,
    });
    const result = yield* Schema.decodeUnknownEffect(SettlementSaveResult)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.actorId !== caller.member.userId ||
      result.householdId !== caller.member.householdId ||
      result.operationId !== operationId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
