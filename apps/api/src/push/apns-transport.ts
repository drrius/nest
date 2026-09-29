import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { NestNotification } from "../../../../packages/contracts/src/push-notification.ts";
import { apnsTokenSigner } from "./apns-token.ts";
import type { ApnsCredentials } from "./apns-token.ts";
import { ApnsHttp2Client } from "./apns-request.ts";
import type { ApnsEnvironment } from "./apns-request.ts";
import { apnsResponse } from "./apns-response.ts";
import type { ApnsResult } from "./apns-response.ts";

export const ApnsDelivery = Schema.Struct({
  // Apple tokens are variable-length opaque bytes. Never assume a 32-byte token.
  token: Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{2}){1,2048}$(?![\s\S])/)),
  environment: Schema.Literals(["sandbox", "production"]),
  apnsId: Schema.String.check(Schema.isUUID()),
  notification: NestNotification,
});

/** Server-only. Call only after one-use DB authorization of this exact registration. */
export function apnsPushTransport(
  credentials: ApnsCredentials,
  environment: ApnsEnvironment,
  client = new ApnsHttp2Client(),
  clock = () => Date.now(),
) {
  const token = apnsTokenSigner(credentials, clock);
  return {
    send: (input: unknown): Effect.Effect<ApnsResult> =>
      Schema.decodeUnknownEffect(ApnsDelivery, { onExcessProperty: "error" })(input).pipe(
        Effect.flatMap((delivery) => {
          if (delivery.environment !== environment)
            return Effect.succeed({ status: "unknown" as const });
          return Effect.tryPromise({
            try: async (signal) => {
              const body = payload(delivery.notification);
              const id = delivery.apnsId.toLowerCase();
              const response = await client.send(
                delivery.environment,
                {
                  headers: {
                    ":method": "POST",
                    ":path": `/3/device/${delivery.token}`,
                    authorization: `bearer ${Redacted.value(token())}`,
                    "apns-topic": "ch.drrius.nest",
                    "apns-push-type": "alert",
                    "apns-priority": "10",
                    // Don't store a stale reminder for later delivery. App content remains available.
                    "apns-expiration": "0",
                    "apns-id": id,
                    "content-type": "application/json",
                  },
                  body,
                },
                signal,
              );
              return apnsResponse(response, id);
            },
            catch: () => ({ status: "unknown" as const }),
          });
        }),
        Effect.orElseSucceed(() => ({ status: "unknown" as const })),
      ),
    close: () => client.close(),
  };
}

function payload(notification: NestNotification): string {
  const body = JSON.stringify({
    aps: {
      alert: {
        title: "Nest",
        body:
          notification.kind === "daily_summary"
            ? "Your daily summary is ready."
            : "You have a reminder in Nest.",
      },
      sound: "default",
    },
    nest: notification,
  });
  if (Buffer.byteLength(body) > 4096) throw new Error("APNs payload too large");
  return body;
}
