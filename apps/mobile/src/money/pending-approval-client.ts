import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  PendingFinancialApprovalQuery,
  PendingFinancialApprovals,
} from "@nest/contracts/pending-financial-approvals";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";

export function pendingApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    pendingFinancialApprovals: (after: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(PendingFinancialApprovalQuery)({
          after,
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const params = new URLSearchParams();
        if (query.after !== null) params.set("after", query.after);
        const result = yield* request(
          `v1/money/pending-approvals?${params}`,
          PendingFinancialApprovals,
        );
        if (result.householdId !== account.household || result.actorId !== account.actor)
          return yield* new PreferenceFailure({ code: "forbidden" });
        if (query.after !== null && result.approvals.some((row) => row.approvalId <= query.after!))
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
