import { ExpenseSaveResult } from "@nest/contracts/expense-save-read";
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
  const status = (input: ExpenseSave, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* prepare(input);
      const value = yield* cancel
        ? request("v1/money/expense/cancel", ExpenseSaveResult, {
            operationId: command.operationId,
          })
        : request(
            `v1/money/expense/receipt?${new URLSearchParams({ operationId: command.operationId })}`,
            ExpenseSaveResult,
          );
      if (
        value.actorId !== account.actor ||
        value.householdId !== account.household ||
        value.operationId !== command.operationId
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (value.receipt !== null && !equivalent(value.receipt.expense, command.expense))
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (cancel && value.status === "unresolved")
        return yield* new PreferenceFailure({ code: "unavailable" });
      return value;
    });
  return {
    recoverExpense: (input: ExpenseSave) => status(input, false),
    cancelExpense: (input: ExpenseSave) => status(input, true),
    saveExpense: (input: ExpenseSave) =>
      Effect.gen(function* () {
        const { operationId, expense } = yield* prepare(input);
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

function prepare(input: ExpenseSave) {
  return Schema.decodeUnknownEffect(SaveExpense)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
    Effect.map((command) => ({
      operationId: command.operationId.toLowerCase(),
      expense: canonicalExpense(command.expense),
    })),
  );
}
