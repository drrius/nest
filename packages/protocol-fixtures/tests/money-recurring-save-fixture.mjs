import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id, input } from "../../../tests/api/recurring-transport-fixture.mjs";
import { recurringSaveOperations } from "../src/money/recurring-save-operations.ts";
import { RecurringSaveRuntime } from "../src/money/recurring-save-runtime.ts";
export { Effect, account, run, id };
const rule = input();
rule.configuration.payerId = account.actor;
rule.configuration.allocations[0].memberId = account.actor;
export const command = { operationId: id(100), rule };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  revision: id(101),
  status: "active",
  approvalId: null,
  rule,
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
    recoverRecurring: () => Effect.sync(() => current),
    saveRecurring: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelRecurringSave: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = recurringSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) => new RecurringSaveRuntime({ ...operations, ...overrides });
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
