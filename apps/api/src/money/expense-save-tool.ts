import * as Effect from "effect/Effect";
import { ExpenseSaveQuery } from "@nest/contracts/expense-save-read";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readExpenseSave } from "./expense-save-read.ts";
export function expenseSaveTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Recover the signed-in member's direct native expense Save receipt using its known operation ID. Never invent an operation ID. A null receipt means no committed receipt was observed; an earlier request may still finish. It does not prove failure and never authorizes a new expense or automatic retry. This read cannot confirm AI proposals, approve, execute or post money. For general history use readMoneyHistory/readMoneyDetail.",
    input: ExpenseSaveQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readExpenseSave(config, { member, token }, input);
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
