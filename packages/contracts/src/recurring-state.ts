import * as Schema from "effect/Schema";
import { RecurringInput } from "./recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
export const RecurringStateInput = Schema.Struct({
  ruleId: Uuid,
  expectedRevision: Uuid,
  expectedStatus: Schema.Literals(["active", "paused"]),
  action: Schema.Literals(["pause", "cancel"]),
}).check(
  Schema.makeFilter((input) => input.action !== "pause" || input.expectedStatus === "active"),
);
export const SaveRecurringState = Schema.Struct({ operationId: Uuid, change: RecurringStateInput });
export const ExecuteRecurringState = Schema.Struct({
  ...SaveRecurringState.fields,
  approvalId: Uuid,
});
export const RecurringStateReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  revision: Uuid,
  status: Schema.Literals(["paused", "cancelled"]),
  change: RecurringStateInput,
}).check(
  Schema.makeFilter(
    (value) =>
      value.revision !== value.change.expectedRevision &&
      value.status === (value.change.action === "pause" ? "paused" : "cancelled"),
  ),
);
export type RecurringStateInput = typeof RecurringStateInput.Type;
export function canonicalRecurringState(input: RecurringStateInput): RecurringStateInput {
  return {
    ...input,
    ruleId: input.ruleId.toLowerCase(),
    expectedRevision: input.expectedRevision.toLowerCase(),
  };
}
