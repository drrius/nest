import * as Effect from "effect/Effect";
import { RenewalQuery, RenewalListQuery } from "@nest/contracts/renewals";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { renewalService } from "./service.ts";
export function renewalReadTools(request: Request, config: IdentityConfig) {
  const read = (input: unknown, list: boolean) =>
    Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      const service = renewalService(config, { member, token });
      return yield* list ? service.list(input) : service.read(input);
    }).pipe(
      Effect.provide(supabaseIdentity(config)),
      Effect.mapError(
        (error) =>
          new CommandFailure({
            code: error.code === "unavailable" ? "unavailable" : "forbidden",
          }),
      ),
    );
  return {
    listRenewals: effectTool({
      description:
        "Read current household renewals, exact revisions, renewal dates and cancellation deadlines. Start with after=null; follow only the returned next cursor. These are reminders, not proof of cancellation or financial obligations. Use readHouseholdRoster for responsible member names; do not invent IDs.",
      input: RenewalListQuery,
      execute: (input) => read(input, true),
    }),
    readRenewal: effectTool({
      description:
        "Read one known household renewal and its exact revision, including retained removed state. Use only a returned renewal ID. Dates do not cancel contracts, alter recurring mandates or change financial history.",
      input: RenewalQuery,
      execute: (input) => read(input, false),
    }),
  };
}
