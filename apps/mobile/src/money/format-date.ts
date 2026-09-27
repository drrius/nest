import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const momentFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
});

export function formatMoneyDay(value: string): string {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return `Original date: ${value}`;
  const date = DateTime.make(`${value}T12:00:00Z`);
  return Option.isSome(date)
    ? DateTime.formatIntl(date.value, dayFormat)
    : `Original date: ${value}`;
}

export function formatMoneyMoment(
  value: string,
  formatter: Intl.DateTimeFormat = momentFormat,
): string {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(value)) return `Original time: ${value}`;
  const date = DateTime.make(value);
  return Option.isSome(date)
    ? DateTime.formatIntl(date.value, formatter)
    : `Original time: ${value}`;
}
