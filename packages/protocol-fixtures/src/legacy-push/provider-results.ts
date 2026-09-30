import * as Schema from "effect/Schema";

const TicketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,200}$/));
const ErrorResult = Schema.Struct({
  status: Schema.Literal("error"),
  details: Schema.optional(Schema.Struct({ error: Schema.String })),
});
const Ticket = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok"), id: TicketId }),
  ErrorResult,
]);
const Receipt = Schema.Union([Schema.Struct({ status: Schema.Literal("ok") }), ErrorResult]);
const reasons = {
  DeviceNotRegistered: "device_not_registered",
  MessageTooBig: "message_too_big",
  MessageRateExceeded: "rate_limited",
  InvalidCredentials: "invalid_credentials",
} as const;
function rejection(code: string | undefined) {
  const reason =
    code && Object.hasOwn(reasons, code)
      ? reasons[code as keyof typeof reasons]
      : "provider_rejected";
  return { status: "rejected" as const, reason };
}

/** A malformed response is uncertainty, never evidence authorizing another send. */
export function expoTicketResult(body: unknown) {
  const envelope = Schema.decodeUnknownOption(Schema.Struct({ data: Ticket }))(body);
  if (envelope._tag === "None") return { status: "unknown" as const };
  const ticket = envelope.value.data;
  return ticket.status === "ok"
    ? { status: "ticket" as const, ticketId: ticket.id }
    : rejection(ticket.details?.error);
}

/** Null means no trustworthy receipt yet; provider messages are never retained. */
export function expoReceiptResult(body: unknown, ticketId: string) {
  if (!Schema.is(TicketId)(ticketId)) return null;
  const envelope = Schema.decodeUnknownOption(
    Schema.Struct({ data: Schema.Record(Schema.String, Schema.Unknown) }),
  )(body);
  if (envelope._tag === "None" || !Object.hasOwn(envelope.value.data, ticketId)) return null;
  const receipt = Schema.decodeUnknownOption(Receipt)(envelope.value.data[ticketId]);
  if (receipt._tag === "None") return null;
  return receipt.value.status === "ok"
    ? { status: "accepted" as const }
    : rejection(receipt.value.details?.error);
}
