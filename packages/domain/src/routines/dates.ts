// Audited from household-os 4a528c9; see docs/native-rewrite/routine-rules-audit.md.
import { asIsoDate, type IsoDate, type IsoWeekday } from "./types.ts";

export function splitIsoDate(date: IsoDate): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function fromUtcParts(year: number, month: number, day: number): IsoDate {
  const resolved = utcDate(year, month, day);
  const yyyy = String(resolved.getUTCFullYear()).padStart(4, "0");
  const mm = String(resolved.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(resolved.getUTCDate()).padStart(2, "0");
  return asIsoDate(`${yyyy}-${mm}-${dd}`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) {
    throw new Error("days must be a safe integer");
  }

  const { year, month, day } = splitIsoDate(date);
  return fromUtcParts(year, month, day + days);
}

export function compareIsoDates(left: IsoDate, right: IsoDate): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function isoWeekday(date: IsoDate): IsoWeekday {
  const { year, month, day } = splitIsoDate(date);
  const jsDay = utcDate(year, month, day).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

export function daysInMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

export function clampDayOfMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month));
}

export function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}
