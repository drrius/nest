import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const SetupStatus = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  foodConfigured: Schema.Boolean,
  cookingConfigured: Schema.Boolean,
  notificationsConfigured: Schema.Boolean,
});
export type SetupStatus = typeof SetupStatus.Type;
export const SetupHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("setup"),
});
export const NotificationSetupHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("notification-preferences"),
});
