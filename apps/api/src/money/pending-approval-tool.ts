import * as Effect from "effect/Effect";
import { PendingFinancialApprovalQuery } from "@nest/contracts/pending-financial-approvals";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readPendingFinancialApprovals } from "./pending-approvals.ts";
export function pendingFinancialApprovalTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "List only the current member's private pending, unexpired financial approval references. Start with after=null and follow returned next cursors. References contain no proposal amounts or details. Ask the member to open the corresponding native approval to review its exact current terms; this read neither approves nor executes anything. Never infer consent from a listed reference or claim that money was posted. A missing reference may have expired or been decided; do not invent its status.",
    input: PendingFinancialApprovalQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readPendingFinancialApprovals(config, { member, token }, input);
      }).pipe(
        Effect.provide(supabaseIdentity(config)),
        Effect.mapError(
          (error) =>
            new CommandFailure({
              code: error.code === "unavailable" ? "unavailable" : "forbidden",
            }),
        ),
      ),
  });
}
