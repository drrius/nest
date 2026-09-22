import type { LegacyAdoptionContext } from "@nest/contracts/legacy-adoption";
import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import type { ExpenseEntryOptions } from "./entry-options.ts";
import {
  initialRecurringDraft,
  parseRecurringDraft,
  type RecurringDraft,
} from "./recurring-draft.ts";
import { centimeInput } from "./correction-draft.ts";
import { legacyAdoptionAttempt } from "./legacy-adoption-save-attempt.ts";
import type { LegacyAdoptionSave } from "./legacy-adoption-client.ts";
export interface AdoptionFormContext {
  review: typeof LegacyAdoptionContext.Type;
  today: string;
  options: ExpenseEntryOptions;
}
export function initialLegacyAdoption(context: AdoptionFormContext): RecurringDraft {
  const row = context.review.rule;
  const shares = row.allocations.kind === "valid" ? row.allocations.shares : [];
  const share = (member: string) => {
    const value = shares.find((entry) => entry.memberId === member);
    return value ? centimeInput(value.centimes) : "";
  };
  return {
    ...initialRecurringDraft(row.payerId, context.today),
    description: row.description,
    amount: centimeInput(row.amountCentimes),
    categoryId: row.categoryId,
    split: "exact",
    firstExact: share(context.options.members[0].actorId),
    secondExact: share(context.options.members[1].actorId),
    cadence: row.schedule.kind,
    day: String(row.schedule.kind === "weekly" ? row.schedule.weekday : row.schedule.dayOfMonth),
  };
}
export function adoptionContextMatches(initial: AdoptionFormContext, current: AdoptionFormContext) {
  return (
    initial.review.reviewToken === current.review.reviewToken &&
    initial.review.rule.ruleId === current.review.rule.ruleId &&
    initial.options.members.every(
      (member, i) => member.actorId === current.options.members[i]?.actorId,
    )
  );
}
export function prepareLegacyAdoption(
  draft: RecurringDraft,
  current: AdoptionFormContext,
  initial: AdoptionFormContext,
  operationId: string,
) {
  if (!adoptionContextMatches(initial, current))
    return {
      ok: false as const,
      message:
        "The retained rule or household changed. Review the latest source and reset the form explicitly.",
    };
  if (current.review.blockers.length)
    return {
      ok: false as const,
      message: "Resolve the listed adoption blockers before granting a new mandate.",
    };
  const parsed = parseRecurringDraft(draft, {
    ruleId: current.review.rule.ruleId,
    today: current.today,
    current: null,
    members: [current.options.members[0].actorId, current.options.members[1].actorId],
  });
  if (!parsed.ok) return parsed;
  const cycle = firstUncoveredRecurringCycle(parsed.rule.configuration.schedule, {
    from: parsed.rule.configuration.startDate,
    coveredThrough: current.review.coveredThrough,
  });
  if (!cycle)
    return {
      ok: false as const,
      message: "No eligible future cycle remains in the supported date range.",
    };
  return {
    ok: true as const,
    command: legacyAdoptionAttempt({
      operationId,
      input: {
        ruleId: parsed.rule.ruleId,
        configuration: parsed.rule.configuration,
        firstDueOn: cycle.dueOn,
        reviewToken: current.review.reviewToken,
      },
    }).command,
  };
}
export function legacyAdoptionGuard() {
  let current: object | null = null;
  return {
    invalidate: () => {
      current = null;
    },
    prepare: (input: LegacyAdoptionSave) => {
      const token = {};
      current = token;
      const command = legacyAdoptionAttempt(input).command;
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
