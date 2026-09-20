import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const NotificationPreferences = Schema.Struct({
  dailySummaryEnabled: Schema.Boolean,
  dailySummaryTime: Schema.String.check(
    Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9]$(?![\s\S])/),
  ),
  itemRemindersEnabled: Schema.Boolean,
});
export const SaveNotificationPreferences = Schema.Struct({
  operationId: Uuid,
  expectedRevision: Revision,
  preferences: NotificationPreferences,
});
export const NotificationPreferenceReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  revision: Revision.check(Schema.makeFilter((value: string) => value !== "0")),
});
export const NotificationProfile = Schema.Struct({
  revision: NotificationPreferenceReceipt.fields.revision,
  preferences: NotificationPreferences,
});
export const NotificationPreferencesEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  timeZone: Schema.Literal("Europe/Zurich"),
  profile: Schema.NullOr(NotificationProfile),
});
export const NotificationPreferenceSaved = Schema.Struct({
  version: Schema.Literal(1),
  receipt: NotificationPreferenceReceipt,
});
export type NotificationPreferences = typeof NotificationPreferences.Type;
export type SaveNotificationPreferences = typeof SaveNotificationPreferences.Type;
export type NotificationPreferenceReceipt = typeof NotificationPreferenceReceipt.Type;
export type NotificationProfile = typeof NotificationProfile.Type;
