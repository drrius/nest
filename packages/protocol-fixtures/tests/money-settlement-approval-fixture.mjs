import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { settlement as payload } from "../../../tests/integration/settlement-api-fixture.mjs";
import { settlementApprovalOperations } from "../src/money/settlement-approval-operations.ts";
import { SettlementApprovalRuntime } from "../src/money/settlement-approval-runtime.ts";
export { Effect, account, run, id };
export const pending = {
  id: id(100),
  operationId: id(101),
  settlement: payload(),
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
      settlement: pending.settlement,
    },
  };
}
export async function fixture(t) {
  const db = await sqlite(t);
  let current = structuredClone(pending),
    calls = 0,
    clock = 1;
  /** @type {null | ((input: import("../src/money/settlement-approval-client.ts").SettlementDecision) => Effect.Effect<import("../src/money/settlement-approval-client.ts").SettlementApproval, import("../src/preferences/client.ts").PreferenceFailure | import("../src/offline/contracts.ts").OfflineFailure>)} */
  let behavior = null;
  const client = {
    settlementApproval: () => Effect.sync(() => structuredClone(current)),
    decideSettlement: (input) =>
      Effect.suspend(() => {
        calls++;
        if (behavior) return behavior(input);
        current = input.approved ? consumed() : { ...pending, status: "denied" };
        return Effect.succeed(current);
      }),
  };
  const operations = settlementApprovalOperations({ store: db.store, session: db.session }, client);
  const runtime = () => new SettlementApprovalRuntime(operations, pending.id, () => clock);
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
