import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readMoneyBalance } from "./read.ts";
export function moneyTools(request: Request, config: IdentityConfig) {
  return {
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
