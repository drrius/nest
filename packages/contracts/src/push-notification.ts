import * as Schema from "effect/Schema";
/** Routing identity only: no user-facing private content or arbitrary URLs. */
export const RenewalNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("renewal"),
  householdId: Schema.String.check(Schema.isUUID()),
  renewalId: Schema.String.check(Schema.isUUID()),
});
export type RenewalNotification = typeof RenewalNotification.Type;
export const DailySummaryNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("daily_summary"),
  householdId: Schema.String.check(Schema.isUUID()),
  recipientId: Schema.String.check(Schema.isUUID()),
  summaryId: Schema.String.check(Schema.isUUID()),
});
export type DailySummaryNotification = typeof DailySummaryNotification.Type;

export const ChoreNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("chore"),
  householdId: Schema.String.check(Schema.isUUID()),
  occurrenceId: Schema.String.check(Schema.isUUID()),
});
export type ChoreNotification = typeof ChoreNotification.Type;

export const MealNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("meal"),
  householdId: Schema.String.check(Schema.isUUID()),
  entryId: Schema.String.check(Schema.isUUID()),
});
export type MealNotification = typeof MealNotification.Type;

export const GroceryNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("grocery"),
  householdId: Schema.String.check(Schema.isUUID()),
  itemId: Schema.String.check(Schema.isUUID()),
});
export type GroceryNotification = typeof GroceryNotification.Type;

export const NestNotification = Schema.Union([
  RenewalNotification,
  DailySummaryNotification,
  ChoreNotification,
  MealNotification,
  GroceryNotification,
]);
export type NestNotification = typeof NestNotification.Type;
