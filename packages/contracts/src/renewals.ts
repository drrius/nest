import * as Schema from "effect/Schema";
import { renewalDeadline } from "@nest/domain/renewals";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const RenewalFields = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(160),
    Schema.makeFilter((value) => value.trim() === value),
  ),
  renewalOn: CalendarDate,
  noticeDays: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 730 })),
  responsibleId: Schema.NullOr(Uuid),
  recurringRuleId: Schema.NullOr(Uuid),
}).check(Schema.makeFilter((value) => renewalDeadline(value.renewalOn, value.noticeDays) !== null));
export type RenewalFields = typeof RenewalFields.Type;
export const SaveRenewal = Schema.Struct({
  operationId: Uuid,
  renewalId: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
  fields: RenewalFields,
});
export const RemoveRenewal = Schema.Struct({
  operationId: Uuid,
  renewalId: Uuid,
  expectedRevision: Uuid,
});
export const Renewal = Schema.Struct({
  renewalId: Uuid,
  revision: Uuid,
  fields: RenewalFields,
  cancellationOn: CalendarDate,
  removed: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (value) =>
      value.cancellationOn === renewalDeadline(value.fields.renewalOn, value.fields.noticeDays),
  ),
);
export const RenewalReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  action: Schema.Literals(["saved", "removed"]),
  renewal: Renewal,
}).check(Schema.makeFilter((value) => value.renewal.removed === (value.action === "removed")));
export const RenewalQuery = Schema.Struct({ renewalId: Uuid });
export const RenewalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  renewal: Renewal,
});
