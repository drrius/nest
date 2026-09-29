import { connect, constants } from "node:http2";
import type { ClientHttp2Session, ClientHttp2Stream, OutgoingHttpHeaders } from "node:http2";
import type { ApnsResponse } from "./apns-response.ts";

export type ApnsEnvironment = "sandbox" | "production";
export type ApnsRequest = { headers: OutgoingHttpHeaders; body: string };
const origins = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

/** One credential/topic per client. Reuse connections; never retry a dispatched stream. */
export class ApnsHttp2Client {
  private readonly sessions = new Map<ApnsEnvironment, ClientHttp2Session>();
  private readonly factory: (origin: string) => ClientHttp2Session;
  private readonly timeoutMs: number;
  constructor(
    factory: (origin: string) => ClientHttp2Session = (origin) =>
      connect(origin, { minVersion: "TLSv1.2", ALPNProtocols: ["h2"] }),
    timeoutMs = 10000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
      throw new Error("Invalid APNs timeout");
    this.factory = factory;
    this.timeoutMs = timeoutMs;
  }

  send(
    environment: ApnsEnvironment,
    input: ApnsRequest,
    signal?: AbortSignal,
  ): Promise<ApnsResponse> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("APNs request interrupted"));
        return;
      }
      let stream: ClientHttp2Stream | undefined;
      let finished = false;
      let status = 0;
      let apnsId: string | undefined;
      let size = 0;
      const chunks: Buffer[] = [];
      const finish = (response?: ApnsResponse) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (response) {
          resolve(response);
        } else {
          stream?.close(constants.NGHTTP2_CANCEL);
          reject(new Error("APNs response not confirmed"));
        }
      };
      const abort = () => finish();
      const timer = setTimeout(abort, this.timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      try {
        stream = this.session(environment).request(input.headers);
        stream.on("response", (headers) => {
          status = Number(headers[":status"]);
          apnsId = typeof headers["apns-id"] === "string" ? headers["apns-id"] : undefined;
        });
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8192) {
            finish();
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          finish({ status, apnsId, body: Buffer.concat(chunks).toString("utf8") }),
        );
        stream.on("error", abort);
        stream.on("aborted", abort);
        stream.on("close", abort);
        stream.end(input.body);
      } catch {
        finish();
      }
    });
  }

  close() {
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
  }

  private session(environment: ApnsEnvironment): ClientHttp2Session {
    const existing = this.sessions.get(environment);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = this.factory(origins[environment]);
    session.unref();
    this.sessions.set(environment, session);
    const remove = () => {
      if (this.sessions.get(environment) === session) this.sessions.delete(environment);
    };
    session.on("error", remove);
    session.on("close", remove);
    session.on("goaway", () => {
      remove();
      session.close();
    });
    return session;
  }
}
