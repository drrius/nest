import * as Schema from "effect/Schema";

const Uuid = Schema.String.check(Schema.isUUID());
const TicketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,200}$(?![\s\S])/));

/** Retained ticket identity for draining historical records; no provider transport. */
export const ReceiptClaim = Schema.Struct({
  version: Schema.Literal(1),
  deliveryId: Uuid,
  attemptId: Uuid,
  ticketId: TicketId,
});
