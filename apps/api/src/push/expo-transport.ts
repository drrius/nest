import type { RenewalNotification } from "../../../../packages/contracts/src/push-notification.ts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { PushToken } from "../../../../packages/contracts/src/push-registration.ts";
import { expoReceiptResult, expoTicketResult } from "./provider-results.ts";

const Delivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  renewalId: Schema.String.check(Schema.isUUID()),
});
const TicketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,200}$(?![\s\S])/));
const endpoint = "https://exp.host/--/api/v2/push/";

async function boundedJson(response: Response) {
  if (!response.ok || !response.body) throw new Error("Unavailable push response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) throw new Error("Push response limit");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

/** Server-only adapter. Call send only after the one-use database authorization. */
export function expoPushTransport(
  accessToken?: Redacted.Redacted<string>,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const post = (method: "send" | "getReceipts", body: unknown) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetcher(endpoint + method, {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${Redacted.value(accessToken)}` } : {}),
          },
          body: JSON.stringify(body),
        });
        return boundedJson(response);
      },
      catch: () => "unavailable" as const,
    }).pipe(Effect.timeout("10 seconds"));
  return {
    send: (input: unknown) =>
      Schema.decodeUnknownEffect(Delivery)(input).pipe(
        Effect.flatMap((delivery) =>
          post("send", {
            to: delivery.token,
            title: "Nest",
            body: "You have a reminder in Nest.",
            sound: "default",
            data: {
              version: 1,
              kind: "renewal",
              householdId: delivery.householdId,
              renewalId: delivery.renewalId,
            } satisfies RenewalNotification,
          }),
        ),
        Effect.map(expoTicketResult),
        Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
      ),
    receipt: (ticketId: string) =>
      Schema.decodeUnknownEffect(TicketId)(ticketId).pipe(
        Effect.flatMap((id) => post("getReceipts", { ids: [id] })),
        Effect.map((body) => expoReceiptResult(body, ticketId)),
        Effect.catch(() => Effect.succeed(null)),
      ),
  };
}
