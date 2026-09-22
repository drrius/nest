import * as Schema from "effect/Schema";
import { LegacyRecurringRule } from "./legacy-recurring.ts";
import { CalendarDate } from "./chores.ts";
import { MoneyTime } from "./money-time.ts";

const Uuid = LegacyRecurringRule.fields.ruleId;
export const LegacyAdoptionContextQuery = Schema.Struct({ ruleId: Uuid });
export const LegacyAdoptionBlocker = Schema.Literals([
  "already_adopted",
  "native_identity_in_use",
  "pending_drafts",
  "unreconciled_history",
  "unsupported_history_dates",
]);
export const LegacyAdoptionContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  rule: LegacyRecurringRule,
  reviewToken: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  coveredThrough: Schema.NullOr(CalendarDate),
  blockers: Schema.Array(LegacyAdoptionBlocker).check(Schema.isMaxLength(5)),
  adoption: Schema.NullOr(
    Schema.Struct({
      nativeRuleId: Uuid,
      authorizedBy: Uuid,
      authorizedAt: MoneyTime,
    }),
  ),
}).check(
  Schema.makeFilter(
    (value) =>
      new Set(value.blockers).size === value.blockers.length &&
      (value.adoption === null
        ? !value.blockers.includes("already_adopted")
        : value.adoption.nativeRuleId === value.rule.ruleId &&
          value.blockers.includes("already_adopted")) &&
      (value.rule.drafts.pending === "0") === !value.blockers.includes("pending_drafts") &&
      (value.rule.drafts.postedWithoutEvent === "0" &&
        value.rule.drafts.unpostedWithEvent === "0") ===
        !value.blockers.includes("unreconciled_history") &&
      (!value.blockers.includes("unsupported_history_dates") || value.coveredThrough === null),
  ),
);
