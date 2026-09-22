import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManualCycleContext } from "@nest/contracts/recurring-manual-context";
import { ManualCycleApprovalQuery } from "@nest/contracts/recurring-manual-approval";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function manualCycleContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ManualCycleApprovalQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const approvalId = query.approvalId.toLowerCase();
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_read_manual_cycle_context",
      { p_household: caller.member.householdId, p_approval: approvalId },
    );
    const result = yield* Schema.decodeUnknownEffect(ManualCycleContext)(raw, {
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
