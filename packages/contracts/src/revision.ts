import * as Schema from "effect/Schema";
export const Revision = Schema.String.check(
  Schema.isPattern(/^(0|[1-9][0-9]{0,18})$(?![\s\S])/),
  Schema.makeFilter((value: string) => BigInt(value) <= 9223372036854775807n),
);
