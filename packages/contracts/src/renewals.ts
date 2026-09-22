import * as Schema from "effect/Schema";
import { renewalDeadline } from "@nest/domain/renewals";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
// PostgreSQL length(text) counts code points, not UTF-16 units or grapheme clusters.
const titleLength = (value: string) => Array.from(value).length;
const StoredTitle = Schema.String.check(
  Schema.makeFilter((value) => {
    const length = titleLength(value.replace(/^ +| +$/g, ""));
    return length >= 1 && length <= 160;
  }),
);
const EditedTitle = Schema.String.check(
  Schema.makeFilter(
    (value) => value.trim() === value && titleLength(value) >= 1 && titleLength(value) <= 160,
  ),
);
const fields = {
  renewalOn: CalendarDate,
  noticeDays: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 730 })),
  responsibleId: Schema.NullOr(Uuid),
  recurringRuleId: Schema.NullOr(Uuid),
};
const validDeadline = (value: { renewalOn: string; noticeDays: number }) =>
  renewalDeadline(value.renewalOn, value.noticeDays) !== null;
export const RenewalFields = Schema.Struct({ title: EditedTitle, ...fields }).check(
  Schema.makeFilter(validDeadline),
);
export const StoredRenewalFields = Schema.Struct({ title: StoredTitle, ...fields }).check(
  Schema.makeFilter(validDeadline),
);
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
  fields: StoredRenewalFields,
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
