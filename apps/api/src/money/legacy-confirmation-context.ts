import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyConfirmationContext } from "@nest/contracts/legacy-confirmation-approval";
import { LegacyConfirmationApprovalQuery } from "@nest/contracts/legacy-confirmation-approval";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function legacyConfirmationContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(LegacyConfirmationApprovalQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const approvalId = query.approvalId.toLowerCase();
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_read_legacy_confirmation_context",
      { p_household: caller.member.householdId, p_approval: approvalId },
    );
    const result = yield* Schema.decodeUnknownEffect(LegacyConfirmationContext)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.actorId !== caller.member.userId ||
      result.householdId !== caller.member.householdId ||
      result.approvalId !== approvalId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
