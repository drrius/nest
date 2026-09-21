import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { correction as payload } from "../../../tests/integration/correction-api-fixture.mjs";
import { correctionSaveOperations } from "../src/money/correction-save-operations.ts";
import { CorrectionSaveRuntime } from "../src/money/correction-save-runtime.ts";
export { Effect, account, run, id };
export const command = { operationId: id(100), correction: payload(id(400)) };
export const attempt = { command, action: "save" };
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  reversalEventId: id(101),
  replacementEventId: null,
  approvalId: null,
  correction: command.correction,
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
    recoverCorrection: () => Effect.sync(() => current),
    saveCorrection: () =>
      Effect.sync(() => {
        calls.push("save");
        current = result("recorded");
        return receipt;
      }),
    cancelCorrection: () =>
      Effect.sync(() => {
        calls.push("cancel");
        current = result("cancelled");
        return current;
      }),
  };
  const operations = correctionSaveOperations({ store: db.store, session: db.session }, client);
  const runtime = (overrides = {}) => new CorrectionSaveRuntime({ ...operations, ...overrides });
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
