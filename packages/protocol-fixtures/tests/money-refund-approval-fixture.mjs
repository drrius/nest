import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { refund as payload } from "../../../tests/integration/refund-api-fixture.mjs";
import { refundApprovalOperations } from "../src/money/refund-approval-operations.ts";
import { RefundApprovalRuntime } from "../src/money/refund-approval-runtime.ts";
export { Effect, account, run, id };
export const pending = {
  id: id(100),
  operationId: id(101),
  refund: payload(id(400)),
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
      refund: pending.refund,
    },
  };
}
export async function fixture(t) {
  const db = await sqlite(t);
  let current = structuredClone(pending),
    calls = 0,
    clock = 1;
  /** @type {null | ((input: import("../src/money/refund-approval-client.ts").RefundDecision) => Effect.Effect<import("../src/money/refund-approval-client.ts").RefundApproval, import("../src/preferences/client.ts").PreferenceFailure | import("../src/offline/contracts.ts").OfflineFailure>)} */
  let behavior = null;
  const client = {
    refundApproval: () => Effect.sync(() => structuredClone(current)),
    decideRefund: (input) =>
      Effect.suspend(() => {
        calls++;
        if (behavior) return behavior(input);
        current = input.approved ? consumed() : { ...pending, status: "denied" };
        return Effect.succeed(current);
      }),
  };
  const operations = refundApprovalOperations({ store: db.store, session: db.session }, client);
  const runtime = () => new RefundApprovalRuntime(operations, pending.id, () => clock);
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
