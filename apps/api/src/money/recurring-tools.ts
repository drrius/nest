import * as Effect from "effect/Effect";
import { RecurringListQuery, RecurringDetailQuery } from "@nest/contracts/recurring-read";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { recurringReads } from "./recurring-read.ts";
export function recurringReadTools(request: Request, config: IdentityConfig) {
  return {
    listRecurringRules: effectTool({
      description:
        "Read up to 50 current household recurring expense configurations. Start with after=null and follow next until null; never infer all rules from one page. Includes active, paused and cancelled configurations, authorization time and planned next date. Scheduled posting is not active yet: these rules do not currently create expenses. Planned dates and active status do not prove a posted expense. Fixed amounts are exact CHF integer centime strings; variable rules have no authorized amount/split. This read grants no mandate, creates no cycle, changes no rule and posts no expense. For setup/edit or interrupted Save recovery, direct the user to Money → Set up recurring expense, or an existing rule’s Edit recurring configuration action.",
      input: RecurringListQuery,
      execute: (input) => read("list", input),
    }),
    readRecurringRule: effectTool({
      description:
        "Read one current household recurring expense configuration by its known ruleId. Use its exact revision, coverage and server Zurich date for current decisions; old tool results are historical. A planned date is not a ledger receipt. Scheduled posting is not active yet. Variable amount/split require separate per-cycle confirmation. Use Money history to inspect actual posted entries. This performs no financial mutation or approval. Do not invent rule IDs or claim to have saved, paused, cancelled or executed a rule. Setup/edit and interrupted Saves currently require the native recurring setup screen.",
      input: RecurringDetailQuery,
      execute: (input) => read("detail", input),
    }),
  };
  function read(kind: "list" | "detail", input: unknown) {
    return Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      return yield* recurringReads(config, { member, token })[kind](input);
    }).pipe(
      Effect.provide(supabaseIdentity(config)),
      Effect.mapError(
        (error) =>
          new CommandFailure({
            code: error.code === "unavailable" ? "unavailable" : "forbidden",
          }),
      ),
    );
  }
}
