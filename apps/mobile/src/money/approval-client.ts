import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExpenseInput } from "@nest/contracts/expense";
import {
  DecideExpense,
  ExpenseApprovalEnvelope,
  ExpenseApprovalQuery,
} from "@nest/contracts/expense-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type ExpenseDecision = typeof DecideExpense.Type;
export type ExpenseApproval = ExpenseApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(ExpenseInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function expenseApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, ExpenseApprovalEnvelope, input).pipe(
      Effect.flatMap((result) =>
        requireMatch(
          result.approval,
          result.actorId === account.actor &&
            result.householdId === account.household &&
            result.approval.id === approvalId,
        ),
      ),
    );
  return {
    approval: (approvalId: string) =>
      validate(ExpenseApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(`v1/money/approval?${new URLSearchParams({ approvalId: target })}`, target);
        }),
      ),
    decideExpense: (input: ExpenseDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideExpense, input);
        const expense = canonical(command.expense);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          expense,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.expense, expense) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
function canonical(input: ExpenseInput): ExpenseInput {
  const share = (value: ExpenseInput["allocations"][number]) => ({
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
