import * as Schema from "effect/Schema";
import { RecurringInput } from "./recurring.ts";
export const RecurringProposalInput = Schema.Struct({
  ...RecurringInput.fields,
  ruleId: Schema.NullOr(RecurringInput.fields.ruleId),
}).check(
  Schema.makeFilter((input) => (input.ruleId === null) === (input.expectedRevision === null)),
);
