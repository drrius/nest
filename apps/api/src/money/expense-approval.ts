import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExpenseInput } from "@nest/contracts/expense";
import {
  DecideExpense,
  ExpenseApprovalEnvelope,
  ExpenseApprovalQuery,
} from "@nest/contracts/expense-approval";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import { canonicalExpense } from "./expense-input.ts";
const equivalent = Schema.toEquivalence(ExpenseInput);
const decode = <T>(
  schema: Schema.Codec<T>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function expenseApprovals(config: IdentityConfig, caller: AuthorizedCaller) {
  const validate = (raw: unknown, approvalId: string) =>
    Effect.gen(function* () {
      const result = yield* decode(ExpenseApprovalEnvelope, raw, "unavailable");
      if (
        result.actorId !== caller.member.userId ||
        result.householdId !== caller.member.householdId ||
        result.approval.id !== approvalId
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(ExpenseApprovalQuery, input, "invalid_request");
        const approvalId = query.approvalId.toLowerCase();
        return yield* validate(
          yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_expense_approval", {
            p_household: caller.member.householdId,
            p_approval: approvalId,
          }),
          approvalId,
        );
      }),
    decide: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(DecideExpense, input, "invalid_request");
        const approvalId = command.approvalId.toLowerCase(),
          operationId = command.operationId.toLowerCase();
        const expense = canonicalExpense(command.expense);
        const result = yield* validate(
          yield* requestJson(config, caller.token, "rest/v1/rpc/nest_decide_expense", {
            p_household: caller.member.householdId,
            p_operation: operationId,
            p_payload: expense,
            p_approval: approvalId,
            p_approved: command.approved,
          }),
          approvalId,
        );
        if (
          result.approval.operationId !== operationId ||
          !equivalent(result.approval.expense, expense) ||
          result.approval.status !== (command.approved ? "consumed" : "denied")
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
