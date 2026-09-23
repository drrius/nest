import * as Effect from "effect/Effect";
import {
  PendingFinancialApprovalQuery,
  PendingFinancialApprovals,
} from "../../../../packages/contracts/src/pending-financial-approvals.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
import { decode } from "../calendar/codec.ts";
export function readPendingFinancialApprovals(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* decode(PendingFinancialApprovalQuery, input, "invalid_request");
    const after = query.after?.toLowerCase() ?? null;
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_pending_financial_approvals",
      {
        p_household: caller.member.householdId,
        p_after: after,
      },
    );
    const page = yield* decode(PendingFinancialApprovals, raw);
    if (
      page.householdId !== caller.member.householdId ||
      page.actorId !== caller.member.userId ||
      page.approvals.some((row) => after !== null && row.approvalId <= after)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return page;
  });
}
export function pendingFinancialApprovalRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  const params = new URL(request.url).searchParams;
  if (params.size > 1 || [...params.keys()].some((key) => key !== "after"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readPendingFinancialApprovals(config, caller, { after: params.get("after") });
}
