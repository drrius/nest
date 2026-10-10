import type { RecurringRule } from "@nest/contracts/recurring-read";
import { formatChf } from "./format.ts";
export function recurringStateSummary(rule: RecurringRule, actor: string) {
  const config = rule.configuration;
  const cadence =
    config.schedule.kind === "weekly"
      ? `Every ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][config.schedule.weekday - 1]}`
      : `Day ${config.schedule.dayOfMonth} each month (last day in shorter months)`;
  const amount =
    config.mode === "fixed"
      ? [
          `Fixed amount: ${formatChf(config.amountCentimes)}`,
          ...config.allocations.map(
            (share) =>
              `${share.memberId === actor ? "Your share" : "Other member’s share"}: ${formatChf(share.centimes)}`,
          ),
        ].join("\n")
      : "Variable amount and split confirmed each cycle";
  return [
    config.description,
    `Rule reference: ${rule.ruleId}`,
    amount,
    `Payer: ${config.payerId === actor ? "You" : "Other household member"}`,
    cadence,
    `Starts ${config.startDate}. Next planned date: ${rule.nextDueOn ?? "None"}.`,
    `Covered through: ${rule.coveredThrough ?? "No completed cycle recorded"}.`,
    `Note: ${config.note ?? "None"}`,
  ].join("\n\n");
}
