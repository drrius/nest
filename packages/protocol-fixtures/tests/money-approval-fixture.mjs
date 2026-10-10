import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id, payload } from "../../../tests/database/native-expense-helpers.mjs";
import { expenseApprovalOperations } from "../src/money/approval-operations.ts";
import { ExpenseApprovalRuntime } from "../src/money/approval-runtime.ts";
export { Effect, account, run, id };
export const pending = {
  id: id(100),
  operationId: id(101),
  expense: payload(),
  status: "pending",
  receipt: null,
  expiresAt: "2030-01-01T00:00:00.000000Z",
};
export const intent = { approvalId: pending.id, operationId: pending.operationId, approved: true };
export function consumed() {
  return {
    ...pending,
    status: "consumed",
    receipt: {
      version: 1,
      actorId: account.actor,
      householdId: account.household,
      operationId: pending.operationId,
      approvalId: pending.id,
      eventId: id(102),
      expense: pending.expense,
    },
  };
}
export async function fixture(t) {
  const db = await sqlite(t);
  let current = structuredClone(pending),
    calls = 0,
    clock = 1;
  /** @type {null | ((input: import("../src/money/approval-client.ts").ExpenseDecision) => Effect.Effect<import("../src/money/approval-client.ts").ExpenseApproval, import("../src/preferences/client.ts").PreferenceFailure | import("../src/offline/contracts.ts").OfflineFailure>)} */
  let behavior = null;
  const client = {
    approval: () => Effect.sync(() => structuredClone(current)),
    decideExpense: (input) =>
      Effect.suspend(() => {
        calls++;
        if (behavior) return behavior(input);
        current = input.approved ? consumed() : { ...pending, status: "denied" };
        return Effect.succeed(current);
      }),
  };
  const operations = expenseApprovalOperations({ store: db.store, session: db.session }, client);
  const runtime = () => new ExpenseApprovalRuntime(operations, pending.id, () => clock);
  return {
    db,
    operations,
    client,
    runtime,
    calls: () => calls,
    now: (value) => {
      clock = value;
    },
    behavior: (value) => {
      behavior = value;
    },
    current: (value) => {
      current = value;
    },
  };
}
