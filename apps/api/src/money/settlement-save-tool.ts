import * as Effect from "effect/Effect";
import { SettlementSaveQuery } from "@nest/contracts/settlement-save-read";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readSettlementSave } from "./settlement-save-read.ts";
export function settlementSaveTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Recover the signed-in member's direct native settlement Save receipt using its known operation ID. Never invent an operation ID. Status unresolved means no terminal outcome was observed; an earlier request may still finish. Unresolved does not prove failure and never authorizes a new settlement or automatic retry. Status cancelled confirms only that this direct Save operation was stopped; it does not reverse existing financial history. To cancel an unresolved direct Save, hand off to native settlement entry; this tool cannot cancel. This read cannot confirm AI proposals, approve, execute or post money. For general history use readMoneyHistory/readMoneyDetail.",
    input: SettlementSaveQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readSettlementSave(config, { member, token }, input);
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
