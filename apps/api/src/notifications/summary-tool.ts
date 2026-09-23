import * as Effect from "effect/Effect";
import { DailySummaryQuery } from "@nest/contracts/daily-summary";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readDailySummary } from "./summary.ts";
export function dailySummaryTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read a known daily summary saved for the requesting member. Use only a returned summary ID. Counts are a historical snapshot, not live completion status, and more=true means additional items beyond the count. This does not prove push delivery. Never infer personal calendar events or financial activity from these counts.",
    input: DailySummaryQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readDailySummary(config, { member, token }, input);
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
