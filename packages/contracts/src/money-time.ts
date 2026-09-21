import * as Schema from "effect/Schema";
// Preserve PostgreSQL's full retained range instead of coercing it to JS Dates.
const datePattern = /^([0-9]{4,7})-([0-9]{2})-([0-9]{2})( BC)?(?![\s\S])/;
const timePattern =
  /^([0-9]{4,6}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.[0-9]{6}Z( BC)?(?![\s\S])/;
const infinite = (value: string) => value === "infinity" || value === "-infinity";
function validDate(value: string) {
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || year > (match[4] ? 4713 : 5874897) || month < 1 || month > 12) return false;
  const astronomical = match[4] ? 1 - year : year;
  const leap = isLeapYear(astronomical);
  return (
    day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
  );
}
export const MoneyDate = Schema.String.check(
  Schema.makeFilter((value) => infinite(value) || validDate(value)),
);
export const MoneyTime = Schema.String.check(
  Schema.makeFilter((value) => {
    if (infinite(value)) return true;
    const match = timePattern.exec(value);
    return (
      match !== null &&
      validDate(`${match[1]}${match[5] ?? ""}`) &&
      Number(match[1]!.split("-")[0]) <= 294276 &&
      Number(match[2]) < 24 &&
      Number(match[3]) < 60 &&
      Number(match[4]) < 60
    );
  }),
);
// Exact day offsets and microseconds from PostgreSQL; never use Number here.
export const MoneyOrder = Schema.String.check(
  Schema.isPattern(/^(?:-?infinity|0|-?[1-9][0-9]{0,19})(?![\s\S])/),
);
export function compareMoneyOrder(a: string, b: string) {
  if (a === b) return 0;
  if (a === "infinity" || b === "-infinity") return 1;
  if (a === "-infinity" || b === "infinity") return -1;
  return BigInt(a) > BigInt(b) ? 1 : -1;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
