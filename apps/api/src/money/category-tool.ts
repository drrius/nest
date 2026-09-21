import * as Effect from "effect/Effect";
import { MoneyCategoryQuery, MoneyCategoriesQuery } from "@nest/contracts/money-category";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readMoneyCategory } from "./category.ts";
import { readMoneyCategories } from "./categories.ts";
export function moneyCategoryTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read the current name and archived status of one known household expense category ID. A null category is unavailable. Do not invent IDs or use archived categories in new proposals. This performs no mutation or approval.",
    input: MoneyCategoryQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readMoneyCategory(config, { member, token }, input);
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

export function moneyCategoriesTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "List a page of active household expense categories to select an existing ID. Start with after null, then use the returned next cursor until null. This reads categories only; it does not create categories or post money.",
    input: MoneyCategoriesQuery,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readMoneyCategories(config, { member, token }, input);
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
