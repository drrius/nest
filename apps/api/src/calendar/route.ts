import { calendarRenewalQuery, readCalendarRenewals } from "./renewals.ts";
import { calendarChoreQuery, readCalendarChores } from "./chores.ts";
import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { calendarCommands } from "./commands.ts";
import { readBusySnapshots } from "./read.ts";
export function calendarRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname,
      commands = calendarCommands(config, caller);
    if (path === "/v1/calendar/renewals")
      return yield* readCalendarRenewals(config, caller, yield* calendarRenewalQuery(request));
    if (path === "/v1/calendar/chores")
      return yield* readCalendarChores(config, caller, yield* calendarChoreQuery(request));
    if (path === "/v1/calendar/consent") return yield* commands.consent();
    if (path === "/v1/calendar/busy") return yield* readBusySnapshots(config, caller);
    const actions: Record<string, (input: unknown) => Effect.Effect<unknown, ApiFailure>> = {
      "/v1/calendar/consent/set": commands.setConsent,
      "/v1/calendar/capture": commands.begin,
      "/v1/calendar/publish": commands.publish,
    };
    return yield* actions[path]!(yield* commandBody(request, 65536));
  });
}
