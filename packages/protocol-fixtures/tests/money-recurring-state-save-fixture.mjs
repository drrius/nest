import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/api/recurring-transport-fixture.mjs";
import { recurringStateSaveOperations } from "../src/money/recurring-state-save-operations.ts";
import { RecurringStateSaveRuntime } from "../src/money/recurring-state-save-runtime.ts";
export { Effect, account, run, id };
const change = {
  ruleId: id(400),
  expectedRevision: id(401),
  expectedStatus: "active",
  action: "pause",
};
export const command = { operationId: id(100), change };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  revision: id(101),
  status: "paused",
  approvalId: null,
  change,
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
    recoverRecurringState: () => Effect.sync(() => current),
    saveRecurringState: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelRecurringStateSave: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = recurringStateSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) =>
    new RecurringStateSaveRuntime({ ...operations, ...overrides });
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
