import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExpenseInput, ExpenseReceipt, SaveExpense, ExecuteExpense } from "@nest/contracts/expense";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(ExpenseInput);
export function expenseCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(approved ? ExecuteExpense : SaveExpense)(
        input,
        { onExcessProperty: "error" },
      ).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
      const approvalId = Schema.is(ExecuteExpense)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase();
      const expense = canonicalExpense(command.expense);
      const raw = yield* requestJson(
        config,
        caller.token,
        approved ? "rest/v1/rpc/nest_execute_expense" : "rest/v1/rpc/nest_save_expense",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
          p_payload: expense,
          ...(approved ? { p_approval: approvalId } : {}),
        },
      );
      const receipt = yield* Schema.decodeUnknownEffect(ExpenseReceipt)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        receipt.actorId !== caller.member.userId ||
        receipt.householdId !== caller.member.householdId ||
        receipt.operationId !== operationId ||
        receipt.approvalId !== approvalId ||
        !equivalent(receipt.expense, expense)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    save: (input: unknown) => run(input, false),
    execute: (input: unknown) => run(input, true),
  };
}

function canonicalExpense(input: ExpenseInput): ExpenseInput {
  const share = (value: (typeof input.allocations)[0]) => ({
    ...value,
    memberId: value.memberId.toLowerCase(),
  });
  return {
    ...input,
    payerId: input.payerId.toLowerCase(),
    categoryId: input.categoryId?.toLowerCase() ?? null,
    allocations: [share(input.allocations[0]), share(input.allocations[1])],
  };
}
