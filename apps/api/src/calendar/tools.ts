import { CalendarChoreQuery } from "@nest/contracts/calendar-chores";
import { readCalendarChores } from "./chores.ts";
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
    openCalendarAgenda: effectTool({
      description:
        "Open the member's private agenda or choose calendars to display on their iPhone. Personal event titles, locations and notes remain on-device and cannot be read by this assistant. This handoff does not grant calendar permission, alter busy sharing, read event details, or create/edit events. The member must open the card and use the native controls; do not claim to know their personal events.",
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({ kind: "device_handoff" as const, screen: "calendar" as const }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
    readCalendarChores: effectTool({
      description:
        "Read stored household chores due on an explicit civil date YYYY-MM-DD. Current occurrences are actionable; previews are tentative next occurrences and cannot be completed. This is not an exhaustive future recurrence forecast. Dates have no time-of-day and do not imply a busy interval. Reads no personal calendar events and makes no changes. Use existing chore tools to act on current occurrences only.",
      input: CalendarChoreQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* readCalendarChores(config, { member, token }, input);
        }).pipe(Effect.provide(supabaseIdentity(config)), Effect.mapError(failure)),
    }),
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
        "Hand off to the native calendar settings when asked to grant calendar access, choose calendars for busy sharing, change busy sharing or refresh device calendars. This only opens a choice for the member: it does not request OS permission, enable/disable consent, publish or refresh calendars. Never claim the change happened. The member must use the native controls.",
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
