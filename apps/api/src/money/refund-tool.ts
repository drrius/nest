import * as Effect from "effect/Effect";
import { RefundContextQuery } from "@nest/contracts/refund";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readRefundContext } from "./refund-context.ts";
export function refundContextTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read the current remaining refundable allocation for each member of an existing expense or replacement. Use a known financial event ID. Amounts are exact CHF centimes. Reversed or fully refunded sources are not refundable. These are current read results, not authorization or a refund promise; another action can change the remaining amounts. This tool does not post, approve or execute a refund.",
    input: RefundContextQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readRefundContext(config, { member, token }, input);
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
