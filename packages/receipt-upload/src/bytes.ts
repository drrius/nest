import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
export const receiptByteLimit = 4 * 1024 * 1024;
export class ReceiptUploadFailure extends Schema.TaggedError<ReceiptUploadFailure>()(
  "ReceiptUploadFailure",
  {
    code: Schema.Literals([
      "invalid",
      "too_large",
      "unavailable",
      "conflict",
      "forbidden",
      "session",
    ]),
  },
) {}
export const readReceiptBytes = (body: ReadableStream<Uint8Array> | null) =>
  Effect.tryPromise({
    try: (signal) => bounded(body, signal),
    catch: (error) =>
      Schema.is(ReceiptUploadFailure)(error)
        ? error
        : new ReceiptUploadFailure({ code: "unavailable" }),
  });
async function bounded(body: ReadableStream<Uint8Array> | null, signal: AbortSignal) {
  if (!body) throw new ReceiptUploadFailure({ code: "invalid" });
  const reader = body.getReader(),
    bytes = new Uint8Array(receiptByteLimit);
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new ReceiptUploadFailure({ code: "unavailable" });
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw new ReceiptUploadFailure({ code: "unavailable" });
      if (chunk.done) break;
      if (size + chunk.value.byteLength > receiptByteLimit)
        throw new ReceiptUploadFailure({ code: "too_large" });
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    if (size === 0) throw new ReceiptUploadFailure({ code: "invalid" });
    return bytes.slice(0, size);
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}
