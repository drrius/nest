import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  RequestChoreTransfer,
  RespondChoreTransfer,
  ChoreTransferReceipt,
  ChoreTransferList,
} from "../../packages/contracts/src/chore-transfers.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const id = (n) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const identity = {
  requestId: id(4),
  occurrenceId: id(5),
  dueDate: "2026-09-20",
  fromMemberId: id(1),
  toMemberId: id(2),
};
test("handover commands reject hidden scope, malformed dates and response substitutions", () => {
  const request = {
    operationId: id(6),
    occurrenceId: id(5),
    expectedDueDate: identity.dueDate,
    recipientId: id(2),
  };
  assert.deepEqual(decode(RequestChoreTransfer, request), request);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(3) },
    { expectedDueDate: "2026-02-30" },
    { recipientId: `${id(2)}\n` },
  ])
    assert.throws(() => decode(RequestChoreTransfer, { ...request, ...patch }));
  const response = { operationId: id(6), requestId: id(4), action: "accept" };
  assert.deepEqual(decode(RespondChoreTransfer, response), response);
  for (const patch of [{ action: "request" }, { occurrenceId: id(8) }, { recipientId: id(1) }])
    assert.throws(() => decode(RespondChoreTransfer, { ...response, ...patch }));
});
test("receipts bind the correct consenting actor and action state, including UUID case aliases", () => {
  for (const [action, state, actorId] of [
    ["request", "pending", id(1)],
    ["accept", "accepted", id(2)],
    ["decline", "declined", id(2)],
  ]) {
    const receipt = { ...identity, actorId, householdId: id(3), operationId: id(6), action, state };
    assert.deepEqual(decode(ChoreTransferReceipt, receipt), receipt);
    assert.doesNotThrow(() =>
      decode(ChoreTransferReceipt, { ...receipt, actorId: actorId.toUpperCase() }),
    );
    for (const patch of [
      { actorId: id(9) },
      { state: "superseded" },
      { toMemberId: id(1).toUpperCase() },
      { hidden: true },
    ])
      assert.throws(() => decode(ChoreTransferReceipt, { ...receipt, ...patch }));
    for (const other of ["pending", "accepted", "declined"].filter((value) => value !== state))
      assert.throws(() => decode(ChoreTransferReceipt, { ...receipt, state: other }));
  }
});
test("pending snapshots retain exact target identity and reject malformed or oversized lists", () => {
  const item = { ...identity, title: "Clean kitchen" };
  const envelope = {
    version: 1,
    householdId: id(3),
    members: [
      { actorId: id(1), displayName: "A" },
      { actorId: id(2), displayName: "B" },
    ],
    transfers: [item],
  };
  assert.deepEqual(decode(ChoreTransferList, envelope), envelope);
  for (const patch of [{ title: "" }, { toMemberId: id(1).toUpperCase() }, { state: "accepted" }])
    assert.throws(() =>
      decode(ChoreTransferList, { ...envelope, transfers: [{ ...item, ...patch }] }),
    );
  assert.throws(() => decode(ChoreTransferList, { ...envelope, transfers: Array(201).fill(item) }));
});
