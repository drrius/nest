// Audited from household-os 4a528c9; validation is separate to keep functions bounded.
import { asIsoDate, type IsoWeekday, type ScheduleKind, type ScheduleRule } from "./types.ts";
export type ScheduleValidationError = {
  code:
    | "kind_mismatch"
    | "empty_weekdays"
    | "duplicate_weekdays"
    | "invalid_day_of_month"
    | "invalid_interval"
    | "invalid_rule";
  message: string;
};

export type ScheduleValidationResult =
  | { ok: true; rule: ScheduleRule }
  | { ok: false; error: ScheduleValidationError };

function isIsoWeekday(value: number): value is IsoWeekday {
  return Number.isSafeInteger(value) && value >= 1 && value <= 7;
}

function ruleError(
  code: ScheduleValidationError["code"],
  message: string,
): ScheduleValidationResult {
  return { ok: false, error: { code, message } };
}

function validateWeekdays(
  rule: Extract<ScheduleRule, { kind: "weekdays" }>,
): ScheduleValidationResult {
  if (rule.days.length === 0) {
    return ruleError("empty_weekdays", "weekdays requires at least one day");
  }

  const unique = new Set<IsoWeekday>();
  for (const day of rule.days) {
    if (!isIsoWeekday(day)) {
      return ruleError("invalid_rule", "weekdays must be ISO weekdays 1-7");
    }

    if (unique.has(day)) {
      return ruleError("duplicate_weekdays", "weekdays must be unique");
    }

    unique.add(day);
  }

  const days = [...unique].sort((a, b) => a - b);
  return { ok: true, rule: { kind: "weekdays", days } };
}

function scheduleKindForRule(rule: ScheduleRule): ScheduleKind {
  switch (rule.kind) {
    case "one_off":
      return "one_off";
    case "after_completion":
      return "after_completion";
    case "daily":
    case "weekdays":
    case "weekly":
    case "biweekly":
    case "monthly":
      return "calendar";
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export function validateScheduleRule(
  scheduleKind: ScheduleKind,
  rule: ScheduleRule,
): ScheduleValidationResult {
  if (scheduleKindForRule(rule) !== scheduleKind) {
    return ruleError(
      "kind_mismatch",
      `Schedule kind ${scheduleKind} does not match rule ${rule.kind}`,
    );
  }

  switch (rule.kind) {
    case "one_off":
      return validateOneOff(rule);
    case "daily":
      return { ok: true, rule };
    case "weekdays":
      return validateWeekdays(rule);
    case "weekly":
    case "biweekly":
      if (!isIsoWeekday(rule.weekday)) {
        return ruleError("invalid_rule", `${rule.kind} weekday must be ISO weekday 1-7`);
      }

      return { ok: true, rule };
    case "monthly":
      return validateMonthly(rule);
    case "after_completion":
      return validateInterval(rule);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

function validateOneOff(
  rule: Extract<ScheduleRule, { kind: "one_off" }>,
): ScheduleValidationResult {
  try {
    return {
      ok: true,
      rule: { kind: "one_off", date: asIsoDate(rule.date) },
    };
  } catch {
    return ruleError("invalid_rule", "one_off date is invalid");
  }
}

function validateMonthly(
  rule: Extract<ScheduleRule, { kind: "monthly" }>,
): ScheduleValidationResult {
  if (!Number.isSafeInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
    return ruleError("invalid_day_of_month", "monthly dayOfMonth must be 1-31");
  }

  return { ok: true, rule };
}

function validateInterval(
  rule: Extract<ScheduleRule, { kind: "after_completion" }>,
): ScheduleValidationResult {
  if (!Number.isSafeInteger(rule.every) || rule.every < 1) {
    return ruleError("invalid_interval", "after_completion every must be a positive integer");
  }

  if (rule.unit !== "days" && rule.unit !== "weeks") {
    return ruleError("invalid_rule", "after_completion unit must be days or weeks");
  }

  return { ok: true, rule };
}
