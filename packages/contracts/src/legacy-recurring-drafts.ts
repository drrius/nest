import * as Schema from "effect/Schema";
import { RecurringInput } from "./recurring.ts";
import { ExpenseInput } from "./expense.ts";
import {
  LegacyRecurringDate,
  LegacyRecurringVersion,
  LegacyRecurringSplit,
  LegacyRecurringDescription,
} from "./legacy-recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
export const LegacyDraftQuery = Schema.Struct({ ruleId: Uuid, after: Schema.NullOr(Uuid) });
export const LegacyRecurringDraft = Schema.Struct({
  draftId: Uuid,
  ruleId: Uuid,
  description: LegacyRecurringDescription,
  amountCentimes: Schema.NullOr(ExpenseInput.fields.amountCentimes),
  payerId: Schema.NullOr(Uuid),
  allocations: LegacyRecurringSplit,
  categoryId: Schema.NullOr(Uuid),
  sourceKind: Schema.Literals(["shopping", "recurring"]),
  shoppingSessionId: Schema.NullOr(Uuid),
  occurredOn: LegacyRecurringDate,
  status: Schema.Literals(["pending", "posted", "dismissed"]),
  updatedAt: LegacyRecurringVersion,
  eventId: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter((row) => {
    if ((row.sourceKind === "shopping") !== (row.shoppingSessionId !== null)) return false;
    if (row.allocations.kind === "needs_review") return true;
    const [a, b] = row.allocations.shares;
    return (
      row.amountCentimes !== null &&
      row.payerId !== null &&
      a.memberId !== b.memberId &&
      row.allocations.shares.some((s) => s.memberId === row.payerId) &&
      BigInt(a.centimes) + BigInt(b.centimes) === BigInt(row.amountCentimes)
    );
  }),
);
export const LegacyDraftList = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...LegacyDraftQuery.fields,
  next: Schema.NullOr(Uuid),
  drafts: Schema.Array(LegacyRecurringDraft).check(Schema.isMaxLength(20)),
}).check(
  Schema.makeFilter(
    (page) =>
      page.drafts.every(
        (row, index) =>
          row.ruleId === page.ruleId &&
          row.draftId > (page.drafts[index - 1]?.draftId ?? page.after ?? ""),
      ) &&
      (page.next === null ||
        (page.drafts.length === 20 && page.next === page.drafts.at(-1)?.draftId)),
  ),
);
