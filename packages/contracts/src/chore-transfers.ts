import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const RequestChoreTransfer = Schema.Struct({
  operationId: Uuid,
  occurrenceId: Uuid,
  expectedDueDate: CalendarDate,
  recipientId: Uuid,
});
export const RespondChoreTransfer = Schema.Struct({
  operationId: Uuid,
  requestId: Uuid,
  action: Schema.Literals(["accept", "decline"]),
});
const transfer = {
  requestId: Uuid,
  occurrenceId: Uuid,
  dueDate: CalendarDate,
  fromMemberId: Uuid,
  toMemberId: Uuid,
};
const differentMembers = (value: { fromMemberId: string; toMemberId: string }) =>
  value.fromMemberId.toLowerCase() !== value.toMemberId.toLowerCase();
export const PendingChoreTransfer = Schema.Struct({
  ...transfer,
  title: Schema.NonEmptyString,
}).check(Schema.makeFilter(differentMembers));
export const ChoreTransferReceipt = Schema.Struct({
  ...transfer,
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  action: Schema.Literals(["request", "accept", "decline"]),
  state: Schema.Literals(["pending", "accepted", "declined"]),
}).check(
  Schema.makeFilter(differentMembers),
  Schema.makeFilter((value) => {
    const expected = { request: "pending", accept: "accepted", decline: "declined" } as const;
    const actor = value.action === "request" ? value.fromMemberId : value.toMemberId;
    return (
      value.state === expected[value.action] && value.actorId.toLowerCase() === actor.toLowerCase()
    );
  }),
);
export const ChoreTransferEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  receipt: ChoreTransferReceipt,
});
export const ChoreTransferList = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  transfers: Schema.Array(PendingChoreTransfer).check(Schema.isMaxLength(200)),
});
