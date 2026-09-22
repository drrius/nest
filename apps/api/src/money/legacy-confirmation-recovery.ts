import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  LegacyConfirmationRecoveryQuery,
  LegacyConfirmationRecovery,
} from "@nest/contracts/legacy-draft-confirmation";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function legacyConfirmationRecovery(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, cancel: boolean) =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(LegacyConfirmationRecoveryQuery)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
      const operationId = query.operationId.toLowerCase();
      const raw = yield* requestJson(
        config,
        caller.token,
        cancel
          ? "rest/v1/rpc/nest_cancel_legacy_confirmation"
          : "rest/v1/rpc/nest_read_legacy_confirmation",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
        },
      );
      const result = yield* Schema.decodeUnknownEffect(LegacyConfirmationRecovery)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        result.actorId !== caller.member.userId ||
        result.householdId !== caller.member.householdId ||
        result.operationId !== operationId ||
        (cancel && result.status === "unresolved")
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    read: (input: unknown) => run(input, false),
    cancel: (input: unknown) => run(input, true),
  };
}
