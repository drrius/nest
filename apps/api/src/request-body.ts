import * as Effect from "effect/Effect";
import { ApiFailure } from "./errors.ts";

const isJson = (request: Request) =>
  request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "application/json";

// Bound actual bytes rather than trusting Content-Length from callers.
export const commandBody = (request: Request, maxBytes = 8192) =>
  Effect.tryPromise({
    try: async (signal) => {
      if (!isJson(request)) {
        throw new Error("JSON required");
      }
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing body");
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) throw new Error("Body too large");
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } finally {
        signal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    },
    catch: () => new ApiFailure({ code: "invalid_request" }),
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.mapError(() => new ApiFailure({ code: "invalid_request" })),
  );
