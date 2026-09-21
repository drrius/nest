import { firstUncoveredRecurringCycle } from "@nest/domain/money";
import type { RecurringEntryContext } from "./recurring-entry-context.ts";
import type { RecurringApproval } from "./recurring-approval-client.ts";
export function matchesRecurringContext(
  approval: RecurringApproval,
  loaded: RecurringEntryContext | null,
) {
  if (!loaded) return false;
  const { rule } = approval,
    { context } = loaded,
    current = context.current;
  if (rule.ruleId !== context.ruleId || rule.expectedRevision !== (current?.revision ?? null))
    return false;
  if (!eligible(approval, loaded)) return false;
  const cycle = firstUncoveredRecurringCycle(rule.configuration.schedule, {
    from: rule.configuration.startDate,
    coveredThrough: current?.coveredThrough ?? null,
  });
  return cycle?.dueOn === rule.firstDueOn;
}

function eligible(approval: RecurringApproval, loaded: RecurringEntryContext) {
  const config = approval.rule.configuration,
    { context } = loaded;
  return validTiming(config.startDate, context) && validMembers(config, context.members);
}
function validTiming(start: string, context: RecurringEntryContext["context"]) {
  const current = context.current;
  if (start < context.today || current?.status === "cancelled") return false;
  return !(
    current?.status === "active" &&
    current.nextDueOn !== null &&
    current.nextDueOn < context.today
  );
}
function validMembers(
  config: RecurringApproval["rule"]["configuration"],
  members: readonly string[],
) {
  return (
    members.includes(config.payerId) &&
    (config.allocations === null ||
      config.allocations.every((share) => members.includes(share.memberId)))
  );
}
