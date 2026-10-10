import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import type { ApnsEnvironment } from "./apns-request.ts";
import type { apnsPushTransport } from "./apns-transport.ts";
import {
  ApnsAttempt,
  ApnsSendResult,
  ApnsAcknowledgment,
  apnsNotification,
} from "./apns-worker-contract.ts";
type Rpc = (
  method: "beginApns" | "finishApnsSend",
  input: Record<string, unknown>,
) => Effect.Effect<unknown, ApiFailure>;
type Provider = Pick<ReturnType<typeof apnsPushTransport>, "send">;

function persist(rpc: Rpc, attempt: ApnsAttempt, result: ApnsSendResult) {
  return rpc("finishApnsSend", {
    p_delivery: attempt.deliveryId,
    p_attempt: attempt.attemptId,
    p_result: result,
  }).pipe(
    // Retry the immutable database acknowledgement only, never an external send.
    Effect.retry({ times: 2, while: (error) => error.code === "unavailable" }),
    Effect.flatMap(Schema.decodeUnknownEffect(ApnsAcknowledgment, { onExcessProperty: "error" })),
    Effect.flatMap((ack) => {
      const exact =
        ack.deliveryId === attempt.deliveryId &&
        ack.attemptId === attempt.attemptId &&
        sameResult(ack.result, result);
      return exact ? Effect.void : Effect.fail(new ApiFailure({ code: "unavailable" }));
    }),
  );
}

function sameResult(left: ApnsSendResult, right: ApnsSendResult): boolean {
  if (left.status !== right.status) return false;
  if (left.status === "provider_accepted")
    return right.status === "provider_accepted" && left.apnsId === right.apnsId;
  if (left.status === "rejected")
    return (
      right.status === "rejected" &&
      left.reason === right.reason &&
      left.invalidatedAt === right.invalidatedAt
    );
  return true;
}

/** Separately bound APNs path. It cannot claim Expo/wrong-environment devices. */
export function apnsDeliveryWorker(rpc: Rpc, provider: Provider, environment: ApnsEnvironment) {
  return {
    send: (deliveryId: string) =>
      Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(Schema.String.check(Schema.isUUID()))(deliveryId);
        const id = deliveryId.toLowerCase();
        const raw = yield* rpc("beginApns", { p_delivery: id, p_environment: environment });
        if (raw === null) return "skipped" as const;
        const attempt = yield* Schema.decodeUnknownEffect(ApnsAttempt, {
          onExcessProperty: "error",
        })(raw);
        if (attempt.deliveryId !== id || attempt.environment !== environment)
          return yield* new ApiFailure({ code: "unavailable" });
        const result = yield* provider
          .send({
            token: attempt.token,
            environment: attempt.environment,
            apnsId: attempt.apnsId,
            notification: apnsNotification(attempt),
          })
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(ApnsSendResult, { onExcessProperty: "error" }),
            ),
          );
        if (result.status === "provider_accepted" && result.apnsId !== attempt.apnsId)
          return yield* new ApiFailure({ code: "unavailable" });
        yield* persist(rpc, attempt, result);
        return "recorded" as const;
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" }))),
  };
}
