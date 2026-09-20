import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export function nodeServer(handler) {
  return createServer(
    { maxHeaderSize: 8192, requestTimeout: 20000, headersTimeout: 10000 },
    (incoming, outgoing) => {
      const abort = new AbortController();
      incoming.once("aborted", () => abort.abort());
      outgoing.once("close", () => {
        if (!outgoing.writableEnded) abort.abort();
      });
      const respond = async () => {
        const method = incoming.method ?? "GET";
        const request = new Request(new URL(incoming.url ?? "/", "http://localhost"), {
          method,
          headers: Object.entries(incoming.headers).flatMap(([key, value]) =>
            value === undefined
              ? []
              : Array.isArray(value)
                ? value.map((item) => [key, item])
                : [[key, value]],
          ),
          body: method === "GET" || method === "HEAD" ? undefined : requestStream(incoming),
          duplex: "half",
          signal: abort.signal,
        });
        const response = await handler(request);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
        else outgoing.end();
      };
      void respond().catch(() => {
        if (!outgoing.headersSent) outgoing.writeHead(503, { "Cache-Control": "no-store" });
        outgoing.end();
      });
    },
  );
}

// Cancelling a rejected body must not abort the response socket. Drain discarded
// bytes with Node backpressure instead of retaining an unread web-stream queue.
function requestStream(incoming) {
  const iterator = incoming.iterator({ destroyOnReturn: false });
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel() {
      void iterator.return().catch(() => undefined);
      incoming.resume();
    },
  });
}
