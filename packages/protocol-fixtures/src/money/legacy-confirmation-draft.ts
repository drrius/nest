import type { LegacyDraftContext } from "@nest/contracts/legacy-draft-dismissal";
import type { ExpenseEntryOptions } from "./entry-options.ts";
import { initialExpenseDraft, parseExpenseDraft, type ExpenseDraft } from "./expense-draft.ts";
import { centimeInput } from "./correction-draft.ts";
import { legacyConfirmationAttempt } from "./legacy-confirmation-save-attempt.ts";
import type { LegacyConfirmationSave } from "./legacy-confirmation-client.ts";
export interface LegacyConfirmationContext {
  review: typeof LegacyDraftContext.Type;
  options: ExpenseEntryOptions;
}
export function initialLegacyConfirmation(context: LegacyConfirmationContext): ExpenseDraft {
  const row = context.review.draft;
  const shares = row.allocations.kind === "valid" ? row.allocations.shares : [];
  const share = (member: string) => {
    const value = shares.find((entry) => entry.memberId === member);
    return value ? centimeInput(value.centimes) : "";
  };
  return {
    ...initialExpenseDraft(row.payerId ?? "", ""),
    description: row.description,
    amount: row.amountCentimes === null ? "" : centimeInput(row.amountCentimes),
    split: "exact",
    firstExact: share(context.options.members[0].actorId),
    secondExact: share(context.options.members[1].actorId),
    date: row.occurredOn.kind === "date" ? row.occurredOn.value : "",
    categoryId: row.categoryId,
  };
}
export function legacyConfirmationContextMatches(
  initial: LegacyConfirmationContext,
  current: LegacyConfirmationContext,
) {
  return (
    initial.review.reviewToken === current.review.reviewToken &&
    initial.review.draft.draftId === current.review.draft.draftId &&
    initial.review.draft.ruleId === current.review.draft.ruleId &&
    initial.options.members.every(
      (member, i) => member.actorId === current.options.members[i]?.actorId,
    )
  );
}
export function prepareLegacyConfirmation(
  draft: ExpenseDraft,
  current: LegacyConfirmationContext,
  initial: LegacyConfirmationContext,
  operationId: string,
) {
  if (!legacyConfirmationContextMatches(initial, current))
    return {
      ok: false as const,
      message:
        "The draft or household changed. Review the current draft and reset the form explicitly.",
    };
  const row = current.review.draft;
  if (row.status !== "pending" || row.sourceKind !== "recurring" || row.eventId !== null)
    return {
      ok: false as const,
      message: "Only pending recurring drafts without a financial event can be confirmed.",
    };
  if (!draft.date)
    return {
      ok: false as const,
      message: "The retained date is unsupported. Choose and confirm an expense date.",
    };
  const parsed = parseExpenseDraft(draft, [
    current.options.members[0].actorId,
    current.options.members[1].actorId,
  ]);
  if (!parsed.ok) return parsed;
  return {
    ok: true as const,
    command: legacyConfirmationAttempt({
      operationId,
      input: {
        draftId: row.draftId,
        ruleId: row.ruleId,
        reviewToken: current.review.reviewToken,
        expense: parsed.expense,
      },
    }).command,
  };
}
export function legacyConfirmationGuard() {
  let current: object | null = null;
  return {
    invalidate: () => {
      current = null;
    },
    prepare: (input: LegacyConfirmationSave) => {
      const token = {};
      current = token;
      const command = legacyConfirmationAttempt(input).command;
      return {
        command,
        consume: () => {
          if (current !== token) return false;
          current = null;
          return true;
        },
      };
    },
  };
}
