import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveExpense, ExpenseInput, ExpenseReceipt } from "@nest/contracts/expense";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import { canonicalExpense } from "./expense-input.ts";
export type ExpenseSave = typeof SaveExpense.Type;
const equivalent = Schema.toEquivalence(ExpenseInput);
export function expenseClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    saveExpense: (input: ExpenseSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveExpense)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          expense = canonicalExpense(command.expense);
        const receipt = yield* request("v1/money/expense/save", ExpenseReceipt, {
          operationId,
          expense,
        });
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== operationId ||
          receipt.approvalId !== null ||
          !equivalent(receipt.expense, expense)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}
