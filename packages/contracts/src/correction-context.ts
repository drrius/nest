import * as Schema from "effect/Schema";
import { MoneyDetail } from "./money-detail.ts";
import { CorrectionInput } from "./correction.ts";
export const CorrectionContextQuery = Schema.Struct({
  sourceEventId: CorrectionInput.fields.sourceEventId,
});
export const CorrectionContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: MoneyDetail.fields.householdId,
  source: MoneyDetail,
  hasActiveRefunds: Schema.Boolean,
  hasOpeningSuccessor: Schema.Boolean,
  canReverse: Schema.Boolean,
  canReplace: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (value) =>
      value.householdId === value.source.householdId &&
      (!value.hasActiveRefunds || ["expense", "replacement"].includes(value.source.event.kind)) &&
      (!value.hasOpeningSuccessor || value.source.event.kind === "opening_balance"),
  ),
  Schema.makeFilter((value) => {
    const kind = value.source.event.kind;
    const expense = ["expense", "replacement"].includes(kind);
    const clear = !value.hasActiveRefunds && !value.hasOpeningSuccessor;
    const unreversed = value.source.reversedById === null;
    return (
      value.canReverse === (kind !== "reversal" && unreversed && clear) &&
      value.canReplace === (clear && ((expense && unreversed) || kind === "opening_balance"))
    );
  }),
);
export type CorrectionContext = typeof CorrectionContext.Type;
