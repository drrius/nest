import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id, payload } from "../../../tests/database/native-expense-helpers.mjs";
import { expenseSaveOperations } from "../src/money/save-operations.ts";
import { ExpenseSaveRuntime } from "../src/money/save-runtime.ts";
export { Effect, account, run, id };
export const command = { operationId: id(100), expense: payload() };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  eventId: id(101),
  approvalId: null,
  expense: command.expense,
};
export const result = (status) => ({
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  status,
  receipt: status === "recorded" ? receipt : null,
});
export async function fixture(t) {
  const db = await sqlite(t);
  let current = result("unresolved"),
    calls = [];
  const client = {
    recoverExpense: () => Effect.sync(() => current),
    saveExpense: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelExpense: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = expenseSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) => new ExpenseSaveRuntime({ ...operations, ...overrides });
  const open = async (instance) => {
    await instance.setOnline(true);
    await instance.setActive(true);
    return instance;
  };
  return {
    db,
    client,
    operations,
    runtime,
    open,
    calls: () => calls,
    current: (value) => {
      current = value;
    },
  };
}
