import { LegacyDraftQuery } from "@nest/contracts/legacy-recurring-drafts";
import { readLegacyDrafts } from "./legacy-draft-read.ts";
import { LegacyRecurringQuery } from "@nest/contracts/legacy-recurring";
import { readLegacyRecurring } from "./legacy-recurring-read.ts";
import { RecurringHistoryQuery } from "@nest/contracts/recurring-history";
import { recurringHistory } from "./recurring-history.ts";
import * as Effect from "effect/Effect";
import { RecurringListQuery, RecurringDetailQuery } from "@nest/contracts/recurring-read";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { recurringReads } from "./recurring-read.ts";
export function recurringReadTools(request: Request, config: IdentityConfig) {
  return {
    listLegacyRecurringDrafts: effectTool({
      description:
        "Read retained drafts for a known legacy rule in pages of 20 by draft ID. Start after=null and follow next until null. Draft contents are their own historical values, not current rule terms. Null amount/payer, needs-review split and unsupported dates/versions must not be inferred. Status posted without eventId, or pending/dismissed with eventId, is a discrepancy requiring reconciliation. Follow a returned eventId using readMoneyDetail for actual financial history and later corrections/refunds; never assert a payment occurred. Shopping-origin records retain that source and require review, not automatic conversion. This read does not confirm, dismiss, repair, opt in or create expenses. Do not recreate these obligations as unlinked expenses or automatic rules.",
      input: LegacyDraftQuery,
      execute: (input) => read("legacy-drafts", input),
    }),
    listLegacyRecurringRules: effectTool({
      description:
        "Read retained legacy recurring rules in pages of 20. Start after=null and follow next until null. Every returned rule is legacy_draft_only: active means the old draft generator was enabled, never a Nest automatic posting mandate. Preserve its exact tagged updatedAt version and draft counts. A needs_review split, unsupported date/version, or nonzero unsupportedDates count requires reconciliation; it is never an adoptable schedule or allocation. Do not infer missing values. Descriptions are raw retained legacy text and may be whitespace-only or otherwise invalid for a new expense; reading them does not validate new expense terms. Posted drafts have a linked retained financial event; pending/dismissed drafts are not posted expenses. Nonzero postedWithoutEvent or unpostedWithEvent means reconciliation is needed; do not claim migration readiness or silently repair these records. This read does not adopt, opt in, generate drafts, confirm or dismiss anything. New automatic posting requires a separate explicit reviewed opt-in; do not recreate a legacy rule as an unlinked automatic rule or infer consent from old active status.",
      input: LegacyRecurringQuery,
      execute: (input) => read("legacy", input),
    }),
    readRecurringHistory: effectTool({
      description:
        "Read up to 20 retained cycles for a known household recurring rule, newest due date first. Start before=null and follow next until null; one page is not the entire history. Source automatic means the approved fixed mandate posted the event; variable means a separately confirmed amount; manual means an existing expense was explicitly linked without creating another expense. amountCentimes and payerId describe the actual original expense, which may differ from the retained configuration for manual linkage. recordedBy is the mandate authorizer for automatic posting or the member who confirmed/link-recorded the cycle, not necessarily the expense payer. This is retained historical evidence, not current rule configuration or proof a payment occurred. Read the linked event with readMoneyDetail for later correction/refund relationships. This read changes no money, mandate, cycle or approval.",
      input: RecurringHistoryQuery,
      execute: (input) => read("history", input),
    }),
    listDueVariableBills: effectTool({
      description:
        "Read active variable bills due by the server Zurich date, in pages of 50. Start after=null and follow next until null. These bills require a separately reviewed amount and split for each cycle. Open the native variable confirmation flow with the returned ruleId; it rechecks current terms before confirmation. This read authorizes no amount, posts no expense and proves no payment.",
      input: RecurringListQuery,
      execute: (input) => read("dueVariable", input),
    }),
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
  function read(
    kind: "dueVariable" | "list" | "detail" | "history" | "legacy" | "legacy-drafts",
    input: unknown,
  ) {
    return Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      if (kind === "legacy-drafts")
        return yield* readLegacyDrafts(config, { member, token }, input);
      if (kind === "legacy") return yield* readLegacyRecurring(config, { member, token }, input);
      return yield* kind === "history"
        ? recurringHistory(config, { member, token }, input)
        : recurringReads(config, { member, token })[kind](input);
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
