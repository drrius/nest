import { refundSaveTool } from "./refund-save-tool.ts";
import { refundContextTool } from "./refund-tool.ts";
import { settlementSaveTool } from "./settlement-save-tool.ts";
import { expenseSaveTool } from "./expense-save-tool.ts";
import { moneyCategoryTool, moneyCategoriesTool } from "./category-tool.ts";
import { MoneyDetailQuery } from "@nest/contracts/money-detail";
import { readMoneyDetail } from "./detail.ts";
import { MoneyHistoryQuery } from "@nest/contracts/money-history";
import { readMoneyHistory } from "./history.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readMoneyBalance } from "./read.ts";
export function moneyTools(request: Request, config: IdentityConfig) {
  return {
    readRefundSave: refundSaveTool(request, config),
    readRefundContext: refundContextTool(request, config),
    readSettlementSave: settlementSaveTool(request, config),
    readExpenseSave: expenseSaveTool(request, config),
    listMoneyCategories: moneyCategoriesTool(request, config),
    readMoneyCategory: moneyCategoryTool(request, config),
    readMoneyDetail: effectTool({
      description:
        "Read one retained financial event by ID, including payer, exact allocations and signed balance deltas, note, current category name, related original ID and reversal ID. A reversal cancels the original's balance effect; both remain in history. Positive delta means owed to that member, negative means they owe. A settlement records an entered payment, never proves a bank transfer. Receipt presence does not grant receipt content access. This performs no mutation.",
      input: MoneyDetailQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* readMoneyDetail(config, { member, token }, input);
        }).pipe(
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(
            (error) =>
              new CommandFailure({
                code: error.code === "unavailable" ? "unavailable" : "forbidden",
              }),
          ),
        ),
    }),
    readMoneyHistory: effectTool({
      description:
        "Read up to 50 retained household financial events, newest occurrence date first. Start with before=null, then use the returned next cursor until null. Never infer a balance or total history from one page. Corrected originals, reversals and replacements stay visible and relatedEventId preserves their relationship. Receipt presence is metadata only; no receipt URL/content is returned. This tool performs no financial mutation.",
      input: MoneyHistoryQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* readMoneyHistory(config, { member, token }, input);
        }).pipe(
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(
            (error) =>
              new CommandFailure({
                code: error.code === "unavailable" ? "unavailable" : "forbidden",
              }),
          ),
        ),
    }),
    readMoneyBalance: effectTool({
      description:
        "Read the current shared CHF balance derived from all retained financial ledger entries. Positive centimes mean the member is owed money; negative mean the member owes money. Values are exact integer centimes encoded as decimal strings. This does not post an expense, settle, approve, change opening balances or imply a bank balance. A zero balance is not proof no financial history exists. Re-read for current decisions; prior tool results are historical.",
      input: Schema.Struct({}),
      execute: () =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* readMoneyBalance(config, { member, token });
        }).pipe(
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(
            (error) =>
              new CommandFailure({
                code: error.code === "unavailable" ? "unavailable" : "forbidden",
              }),
          ),
        ),
    }),
  };
}
