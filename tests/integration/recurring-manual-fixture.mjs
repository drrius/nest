import { fixture as variableFixture, id, run } from "./recurring-variable-fixture.mjs";
import { payload } from "../database/native-expense-helpers.mjs";
export { id, run };
export async function fixture(t) {
  const f = await variableFixture(t, [
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "supabase/migrations/20260921232720_native_recurring_manual_cycle.sql",
  ]);
  const source = await f.rpc("nest_save_expense", {
    p_household: id(10),
    p_operation: id(701),
    p_payload: payload({ date: f.command.input.dueOn }),
  });
  const command = {
    operationId: f.command.operationId,
    input: {
      ruleId: f.command.input.ruleId,
      expectedRevision: f.command.input.expectedRevision,
      dueOn: f.command.input.dueOn,
      sourceEventId: source.eventId,
    },
  };
  return { ...f, command, variableCommand: f.command };
}
