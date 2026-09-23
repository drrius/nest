import * as Schema from "effect/Schema";
/** Routing identity only: no user-facing private content or arbitrary URLs. */
export const RenewalNotification = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("renewal"),
  householdId: Schema.String.check(Schema.isUUID()),
  renewalId: Schema.String.check(Schema.isUUID()),
});
export type RenewalNotification = typeof RenewalNotification.Type;
