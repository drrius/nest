import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { refund as payload } from "../../../tests/integration/refund-api-fixture.mjs";
import { refundSaveOperations } from "../src/money/refund-save-operations.ts";
import { RefundSaveRuntime } from "../src/money/refund-save-runtime.ts";
export { Effect, account, run, id };
export const command = { operationId: id(100), refund: payload(id(400)) };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  eventId: id(101),
  approvalId: null,
  refund: command.refund,
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
    recoverRefund: () => Effect.sync(() => current),
    saveRefund: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelRefund: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = refundSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) => new RefundSaveRuntime({ ...operations, ...overrides });
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
