import {
  parseRecurringDraft,
  type RecurringDraft,
  type RecurringDraftContext,
} from "./recurring-draft.ts";
import type { RecurringSaveView } from "./recurring-save-runtime.ts";
import type { RecurringSave } from "./recurring-client.ts";
import { saveAttempt } from "./recurring-save-attempt.ts";
import { formatChf } from "./format.ts";
export function recurringEntryEnabled(view: RecurringSaveView) {
  return (
    view.active &&
    view.online &&
    view.fresh &&
    !view.busy &&
    !view.verify &&
    view.attempt === null &&
    view.result === null
  );
}
export function prepareRecurringConfirmation(
  draft: RecurringDraft,
  context: RecurringDraftContext,
  initial: RecurringDraftContext,
  operationId: string,
) {
  if (context.ruleId !== initial.ruleId || context.current?.revision !== initial.current?.revision)
    return {
      ok: false as const,
      message: "This recurring expense changed. Reload its current configuration before editing.",
    };
  if (context.members.some((member, index) => member !== initial.members[index]))
    return {
      ok: false as const,
      message: "Household membership changed. Reload the form before editing.",
    };
  const parsed = parseRecurringDraft(draft, context);
  if (!parsed.ok) return parsed;
  return { ok: true as const, command: { operationId, rule: parsed.rule } };
}
/** Capture the exact immutable preview; a later context/field/activity change invalidates it. */
export function recurringConfirmationGuard() {
  let current: object | null = null;
  return {
    invalidate: () => {
      current = null;
    },
    prepare: (command: RecurringSave) => {
      const token = {};
      current = token;
      const captured = saveAttempt(command).command;
      return {
        command: captured,
        consume: () => {
          if (current !== token) return false;
          current = null;
          return true;
        },
      };
    },
  };
}
export function recurringConfirmationText(command: RecurringSave, actor: string) {
  const rule = command.rule,
    config = rule.configuration;
  const amount =
    config.mode === "fixed"
      ? `Fixed amount: ${formatChf(config.amountCentimes)}.\n${config.allocations
          .map(
            (share) =>
              `${share.memberId === actor ? "Your share" : "Other member’s share"}: ${formatChf(share.centimes)}`,
          )
          .join("\n")}`
      : "Variable bill: amount and split require confirmation for each cycle.";
  const cadence =
    config.schedule.kind === "weekly"
      ? `Weekly, weekday ${config.schedule.weekday} (Monday is 1).`
      : `Monthly, day ${config.schedule.dayOfMonth}; shorter months use their last day.`;
  return [
    config.description,
    amount,
    `Payer: ${config.payerId === actor ? "You" : "Other household member"}.`,
    cadence,
    `Starts ${config.startDate}. First eligible date: ${rule.firstDueOn}.`,
    "Earlier cycles are not backfilled. Existing financial history is retained.",
    config.mode === "fixed"
      ? "Saving authorizes this exact fixed configuration for automatic expense recording. Scheduled posting is not active yet; no expense is created by this Save."
      : "Saving this configuration does not authorize a cycle’s amount or record an expense.",
  ].join("\n\n");
}
