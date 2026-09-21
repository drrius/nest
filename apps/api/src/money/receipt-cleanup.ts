import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import {
  ReceiptUploadInput,
  ReceiptUploadCleanup,
  canonicalReceiptUpload,
} from "@nest/contracts/receipt-upload";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function cleanupReceipt(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknownEffect(ReceiptUploadInput)(input, {
      onExcessProperty: "error",
    }).pipe(
      Effect.map(canonicalReceiptUpload),
      Effect.mapError(() => new ApiFailure({ code: "invalid_request" })),
    );
    const transition = (finish: boolean) =>
      Effect.gen(function* () {
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_cleanup_receipt_upload",
          {
            p_household: caller.member.householdId,
            p_input: parsed,
            p_finish: finish,
          },
        );
        const result = yield* Schema.decodeUnknownEffect(ReceiptUploadCleanup)(raw, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
        const extension = parsed.contentType === "image/jpeg" ? "jpg" : "pdf";
        const path = `${caller.member.householdId}/receipts/${parsed.uploadId}.${extension}`;
        if (
          result.householdId !== caller.member.householdId ||
          result.uploadId !== parsed.uploadId ||
          result.path !== path
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      });
    const started = yield* transition(false);
    if (started.status !== "deleting") return started;
    // A lost HTTP acknowledgment is reconciled against actual object absence.
    // Never conclude deletion from the DELETE response alone.
    yield* removeObject(config, caller.token, started.path).pipe(Effect.catch(() => Effect.void));
    const finished = yield* transition(true);
    if (finished.status === "deleting") return yield* new ApiFailure({ code: "unavailable" });
    return finished;
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.mapError((error) =>
      Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
    ),
  );
}
function removeObject(config: IdentityConfig, token: string, path: string) {
  return Effect.gen(function* () {
    const response = yield* HttpClient.del(
      new URL("storage/v1/object/household-files", config.url),
      {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
        body: yield* HttpBody.json({ prefixes: [path] }),
      },
    );
    if (response.status < 200 || response.status >= 300)
      return yield* new ApiFailure({ code: "unavailable" });
  }).pipe(
    Effect.timeout("10 seconds"),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", credentials: "omit" }),
  );
}
