import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
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

export function expoPushRequest(
  accessToken: Redacted.Redacted<string> | undefined,
  fetcher: typeof fetch,
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
  return post;
}
