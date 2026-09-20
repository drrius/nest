import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AvailabilityQuery } from "@nest/contracts/calendar";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { readAvailability } from "./availability.ts";
import type { ApiFailure } from "../errors.ts";
const failure = (error: ApiFailure) =>
  new CommandFailure({ code: error.code === "unavailable" ? "unavailable" : "forbidden" });
export function calendarTools(request: Request, config: IdentityConfig) {
  return {
    readAvailability: effectTool({
      description:
        "Read current opted-in busy availability for each current household member within an explicit UTC millisecond range of at most 31 days. Ask for the intended date/time when unclear. Returns only busy intervals clipped to the query, freshness and busy/free/unknown states, never personal event details. Unknown means unavailable evidence, never free. Free only means no busy intervals in opted-in calendars, not guaranteed availability. Read again for every new scheduling decision; saved conversation results are historical. Availability is a warning, never permission to block household actions.",
      input: AvailabilityQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* readAvailability(config, { member, token }, input);
        }).pipe(Effect.provide(supabaseIdentity(config)), Effect.mapError(failure)),
    }),
    openCalendarSettings: effectTool({
      description:
        "Hand off to the native calendar settings when asked to grant calendar access, choose calendars, change busy sharing or refresh device calendars. This only opens a choice for the member: it does not request OS permission, enable/disable consent, publish or refresh calendars. Never claim the change happened. The member must use the native controls.",
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({ kind: "device_handoff" as const, screen: "calendar-sharing" as const }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
  };
}
