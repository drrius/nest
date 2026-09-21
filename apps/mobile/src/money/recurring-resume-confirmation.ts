import { planRecurringResume } from "@nest/domain/money";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringResumeInput } from "@nest/contracts/recurring-resume";
import { stateSaveAttempt } from "./recurring-state-save-attempt.ts";
import { recurringStateSummary } from "./recurring-state-summary.ts";
export function prepareRecurringResume(rule: RecurringRule, today: string, operationId: string) {
  if (rule.status !== "paused") return null;
  const plan = planRecurringResume(rule.configuration.schedule, {
    today,
    startDate: rule.configuration.startDate,
    coveredThrough: rule.coveredThrough,
  });
  if (!plan) return null;
  const change: RecurringResumeInput = {
    ruleId: rule.ruleId,
    expectedRevision: rule.revision,
    expectedStatus: "paused",
    action: "resume",
    resumeFrom: plan.resumeFrom,
    firstDueOn: plan.cycle.dueOn,
  };
  return { rule, change, command: stateSaveAttempt({ operationId, change }).command };
}
export function resumeConfirmationText(
  expected: Pick<NonNullable<ReturnType<typeof prepareRecurringResume>>, "rule" | "change">,
  actor: string,
) {
  return [
    recurringStateSummary({ ...expected.rule, nextDueOn: expected.change.firstDueOn }, actor),
    `Resume from ${expected.change.resumeFrom}. First eligible date: ${expected.change.firstDueOn}.`,
    expected.rule.configuration.mode === "fixed"
      ? "Authorize future automatic expense recording with this exact amount, payer and split. This does not make payments."
      : "Resume this variable rule. Each cycle still requires explicit amount and split confirmation before recording an expense.",
    "Skipped paused cycles will not be backfilled. Recorded expenses and covered periods remain unchanged.",
    "Scheduled posting is not active yet. Resuming records your authorization, not an expense.",
  ].join("\n\n");
}
