import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { settlement as payload } from "../../../tests/integration/settlement-api-fixture.mjs";
import { settlementSaveOperations } from "../src/money/settlement-save-operations.ts";
import { SettlementSaveRuntime } from "../src/money/settlement-save-runtime.ts";
export { Effect, account, run, id };
export const command = { operationId: id(100), settlement: payload() };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  eventId: id(101),
  approvalId: null,
  settlement: command.settlement,
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
    recoverSettlement: () => Effect.sync(() => current),
    saveSettlement: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelSettlement: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = settlementSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) => new SettlementSaveRuntime({ ...operations, ...overrides });
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
