import * as Schema from "effect/Schema";
import { SaveExpense } from "@nest/contracts/expense";
import { canonicalExpense } from "./expense-input.ts";
export const ExpenseSaveAttempt = Schema.Struct({
  command: SaveExpense,
  action: Schema.Literals(["save", "cancel"]),
});
export type ExpenseSaveAttempt = typeof ExpenseSaveAttempt.Type;
export function saveAttempt(input: typeof SaveExpense.Type): ExpenseSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveExpense)(input, { onExcessProperty: "error" });
  return {
    action: "save",
    command: {
      operationId: command.operationId.toLowerCase(),
      expense: canonicalExpense(command.expense),
    },
  };
}
