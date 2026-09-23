import { CalendarRenewalQuery } from "../../../../packages/contracts/src/calendar-renewals.ts";
import { readCalendarRenewals } from "../calendar/renewals.ts";
import * as Effect from "effect/Effect";
import { RenewalQuery, RenewalListQuery } from "@nest/contracts/renewals";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { renewalService } from "./service.ts";
export function renewalReadTools(request: Request, config: IdentityConfig) {
  const read = (input: unknown, kind: "list" | "detail" | "day") =>
    Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      const service = renewalService(config, { member, token });
      if (kind === "day") return yield* readCalendarRenewals(config, { member, token }, input);
      return yield* kind === "list" ? service.list(input) : service.read(input);
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
    readRenewalsOnDate: effectTool({
      description:
        "Read household renewals and cancellation deadlines on one exact calendar date. Start with after=null and follow returned next cursors. This is an app-only Calendar layer, not personal calendar data or evidence of cancellation, payment or financial obligations.",
      input: CalendarRenewalQuery,
      execute: (input) => read(input, "day"),
    }),
    listRenewals: effectTool({
      description:
        "Read current household renewals, exact revisions, renewal dates and cancellation deadlines. Start with after=null; follow only the returned next cursor. These are reminders, not proof of cancellation or financial obligations. Use readHouseholdRoster for responsible member names; do not invent IDs.",
      input: RenewalListQuery,
      execute: (input) => read(input, "list"),
    }),
    readRenewal: effectTool({
      description:
        "Read one known household renewal and its exact revision, including retained removed state. Use only a returned renewal ID. Dates do not cancel contracts, alter recurring mandates or change financial history.",
      input: RenewalQuery,
      execute: (input) => read(input, "detail"),
    }),
  };
}
