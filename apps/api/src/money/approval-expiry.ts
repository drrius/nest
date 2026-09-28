import * as Effect from "effect/Effect";
import {
  FinancialApprovalExpiry,
  FinancialApprovalExpiryQuery,
} from "../../../../packages/contracts/src/financial-approval-expiry.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
import { decode } from "../calendar/codec.ts";
export function financialApprovalExpiryRoute(
  url: URL,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const params = url.searchParams;
    if (
      params.size !== 3 ||
      [...params.keys()].some((key) => !["approvalId", "operationId", "command"].includes(key))
    )
      return yield* new ApiFailure({ code: "invalid_request" });
    const query = yield* decode(
      FinancialApprovalExpiryQuery,
      Object.fromEntries(params),
      "invalid_request",
    );
    const approvalId = query.approvalId.toLowerCase(),
      operationId = query.operationId.toLowerCase();
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_financial_approval_expiry",
      {
        p_household: caller.member.householdId,
        p_approval: approvalId,
        p_operation: operationId,
        p_command: query.command,
      },
    );
    const result = yield* decode(FinancialApprovalExpiry, raw);
    if (
      result.actorId !== caller.member.userId ||
      result.householdId !== caller.member.householdId ||
      result.approvalId !== approvalId ||
      result.operationId !== operationId ||
      result.command !== query.command
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
