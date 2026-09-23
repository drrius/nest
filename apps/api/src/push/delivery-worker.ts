import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PushToken } from "../../../../packages/contracts/src/push-registration.ts";
import { ApiFailure } from "../errors.ts";
import type { expoPushTransport } from "./expo-transport.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Attempt = Schema.Struct({
  version: Schema.Literal(1),
  deliveryId: Uuid,
  attemptId: Uuid,
  outboxId: Uuid,
  installationId: Uuid,
  registrationRevision: Uuid,
  token: PushToken,
  householdId: Uuid,
  renewalId: Uuid,
});
type Provider = ReturnType<typeof expoPushTransport>;
type SendResult = Effect.Success<ReturnType<Provider["send"]>>;
type ReceiptResult = NonNullable<Effect.Success<ReturnType<Provider["receipt"]>>>;
export type PushWorkerRpc = (
  method: "begin" | "finishSend" | "finishReceipt",
  input: Record<string, unknown>,
) => Effect.Effect<unknown, ApiFailure>;
const TicketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,200}$(?![\s\S])/));
export const ReceiptClaim = Schema.Struct({
  version: Schema.Literal(1),
  deliveryId: Uuid,
  attemptId: Uuid,
  ticketId: TicketId,
});
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  });
}
function persist(
  rpc: PushWorkerRpc,
  input: {
    deliveryId: string;
    attemptId: string;
    ticketId?: string;
    result: SendResult | ReceiptResult;
  },
) {
  const method = input.ticketId === undefined ? "finishSend" : "finishReceipt";
  const command = {
    p_delivery: input.deliveryId,
    p_attempt: input.attemptId,
    p_result: input.result,
    ...(input.ticketId === undefined ? {} : { p_ticket: input.ticketId }),
  };
  return rpc(method, command).pipe(
    // Only the immutable DB outcome is retried; never the external send.
    Effect.retry({ times: 2 }),
    Effect.flatMap((ack) => {
      const expected = {
        version: 1,
        deliveryId: input.deliveryId,
        attemptId: input.attemptId,
        result: input.result,
        ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
      };
      return canonical(ack) === canonical(expected)
        ? Effect.void
        : Effect.fail(new ApiFailure({ code: "unavailable" }));
    }),
  );
}
export function pushDeliveryWorker(rpc: PushWorkerRpc, provider: Provider) {
  return {
    send: (deliveryId: string) =>
      Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(Uuid)(deliveryId);
        const raw = yield* rpc("begin", { p_delivery: deliveryId });
        if (raw === null) return "skipped" as const;
        const attempt = yield* Schema.decodeUnknownEffect(Attempt)(raw);
        if (attempt.deliveryId !== deliveryId)
          return yield* new ApiFailure({ code: "unavailable" });
        const result = yield* provider.send(attempt);
        yield* persist(rpc, { deliveryId, attemptId: attempt.attemptId, result });
        return "recorded" as const;
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" }))),
    receipt: (input: unknown) =>
      Effect.gen(function* () {
        const claim = yield* Schema.decodeUnknownEffect(ReceiptClaim)(input);
        const result = yield* provider.receipt(claim.ticketId);
        if (result === null) return "pending" as const;
        yield* persist(rpc, { ...claim, result });
        return "recorded" as const;
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" }))),
  };
}
