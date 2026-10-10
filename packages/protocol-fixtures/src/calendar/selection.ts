import * as Schema from "effect/Schema";
import { SetCalendarConsent, CalendarConsent } from "@nest/contracts/calendar";
export const CalendarIds = Schema.Array(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
).check(
  Schema.isMaxLength(256),
  Schema.makeFilter((ids) => new Set(ids).size === ids.length),
);
const Selected = CalendarIds.check(Schema.isMinLength(1));
export const CalendarSelection = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("active"),
    consent: CalendarConsent,
    calendarIds: Selected,
  }).check(Schema.makeFilter((value) => value.consent.enabled && value.consent.version !== "0")),
  Schema.Struct({
    status: Schema.Literal("pending"),
    command: SetCalendarConsent,
    calendarIds: CalendarIds,
  }).check(
    Schema.makeFilter((value) =>
      value.command.enabled ? value.calendarIds.length > 0 : value.calendarIds.length === 0,
    ),
  ),
]);
export type CalendarSelection = typeof CalendarSelection.Type;
export const sameConsent = (left: CalendarConsent, right: CalendarConsent) =>
  left.incarnation === right.incarnation &&
  left.version === right.version &&
  left.enabled === right.enabled;
