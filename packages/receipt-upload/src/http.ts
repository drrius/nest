import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { ReceiptUploadFailure } from "./bytes.ts";
export interface UploadConfig {
  url: string;
  publishableKey: string;
  credential: Redacted.Redacted<string>;
}
export function validateUploadConfig(config: UploadConfig): UploadConfig {
  const url = new URL(config.url);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !local) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid upload service origin");
  if (!configured(config)) throw new Error("Upload service credentials unavailable");
  return { ...config, url: url.href };
}
export function receiptRequest(
  config: UploadConfig,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers({ apikey: config.publishableKey, Authorization: `Bearer ${token}` });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return Effect.tryPromise({
    try: (signal) =>
      fetch(new URL(path, config.url), {
        ...init,
        signal,
        redirect: "error",
        headers,
      }),
    catch: () => new ReceiptUploadFailure({ code: "unavailable" }),
  }).pipe(
    Effect.timeout("10 seconds"),
    Effect.mapError(() => new ReceiptUploadFailure({ code: "unavailable" })),
  );
}
export const responseJson = (response: Response) =>
  Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => new ReceiptUploadFailure({ code: "unavailable" }),
  });
export function responseFailure(response: Response) {
  void response.body?.cancel().catch(() => {});
  if (response.status === 401) return new ReceiptUploadFailure({ code: "session" });
  if (response.status === 403) return new ReceiptUploadFailure({ code: "forbidden" });
  if ([409, 404, 410].includes(response.status))
    return new ReceiptUploadFailure({ code: "conflict" });
  return new ReceiptUploadFailure({ code: "unavailable" });
}
export const decodeFailure = () => new ReceiptUploadFailure({ code: "unavailable" });
function configured(config: UploadConfig) {
  return (
    config.publishableKey.startsWith("sb_publishable_") &&
    Boolean(Redacted.value(config.credential))
  );
}
