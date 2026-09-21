import * as Effect from "effect/Effect";
import { CorrectionContextQuery } from "@nest/contracts/correction-context";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readCorrectionContext } from "./correction-context.ts";
export function correctionContextTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read a retained financial entry and current eligibility to reverse or replace it. Corrections retain the original and append reversal/replacement history. Active refunds must be reversed before correcting their source. Opening balances retain a single lineage; a reversed leaf may be repaired. Current eligibility is not authorization and can change. Receipt presence is metadata only. This tool does not save, approve or execute a correction.",
    input: CorrectionContextQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readCorrectionContext(config, { member, token }, input);
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
