import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReceiptUploadInput, canonicalReceiptUpload } from "@nest/contracts/receipt-upload";
import { readReceiptBytes, ReceiptUploadFailure } from "./bytes.ts";
import { inspectAttachment } from "./inspect.ts";
import { uploadCaller } from "./identity.ts";
import { reserveUpload } from "./reserve.ts";
import { receiptDigest, uploadObject, verifyStoredObject } from "./storage.ts";
import { validateUploadConfig, type UploadConfig } from "./http.ts";
const Query = Schema.Struct({ uploadId: Schema.String.check(Schema.isUUID()) });
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function upload(request: Request, config: UploadConfig) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.searchParams.size !== 1) return yield* new ReceiptUploadFailure({ code: "invalid" });
    const query = yield* Schema.decodeUnknownEffect(Query)(Object.fromEntries(url.searchParams), {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ReceiptUploadFailure({ code: "invalid" })));
    const caller = yield* uploadCaller(config, request),
      bytes = yield* readReceiptBytes(request.body);
    const type = inspectAttachment(bytes);
    if (!type) return yield* new ReceiptUploadFailure({ code: "invalid" });
    const input = canonicalReceiptUpload(
      yield* Schema.decodeUnknownEffect(ReceiptUploadInput)({
        ...query,
        sha256: yield* receiptDigest(bytes),
        bytes: bytes.length,
        contentType: type.mime,
      }).pipe(Effect.mapError(() => new ReceiptUploadFailure({ code: "invalid" }))),
    );
    const reserved = yield* reserveUpload(config, caller, input);
    if (!reserved.stored)
      yield* uploadObject(config, reserved, bytes).pipe(
        Effect.catchTag("ReceiptUploadFailure", () => Effect.void),
      );
    // Always reconcile through caller authorization, then compare the actual object bytes.
    const current = yield* reserveUpload(config, caller, input);
    if (!current.stored) return yield* new ReceiptUploadFailure({ code: "unavailable" });
    yield* verifyStoredObject(config, caller, current);
    return current;
  });
}
export function createReceiptUploadHandler(raw: UploadConfig) {
  const config = validateUploadConfig(raw);
  return (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return Promise.resolve(new Response(null, { status: 405, headers: { Allow: "POST" } }));
    return Effect.runPromise(
      upload(request, config).pipe(
        Effect.timeout("30 seconds"),
        Effect.map((value) => reply(201, value)),
        Effect.catch((error) => {
          const code = Schema.is(ReceiptUploadFailure)(error) ? error.code : "unavailable";
          const status = {
            invalid: 400,
            too_large: 413,
            unavailable: 503,
            conflict: 409,
            forbidden: 403,
            session: 401,
          }[code];
          return Effect.succeed(reply(status, { error: { code } }));
        }),
      ),
      { signal: request.signal },
    ).catch(() => reply(503, { error: { code: "unavailable" } }));
  };
}
