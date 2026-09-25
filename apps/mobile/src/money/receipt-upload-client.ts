import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import {
  ReceiptUploadInput,
  ReceiptUploadReservation,
  canonicalReceiptUpload,
} from "@nest/contracts/receipt-upload";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { PreferenceFailure } from "../preferences/client.ts";
export interface ReceiptUploadSettings {
  publishableKey: string;
  digest: (bytes: Uint8Array) => Effect.Effect<string, PreferenceFailure>;
}
export interface ReceiptStorage {
  origin: string;
  upload?: ReceiptUploadSettings;
}
const failure = (code: PreferenceFailure["code"]) => new PreferenceFailure({ code });
const equivalent = Schema.toEquivalence(ReceiptUploadInput);
function uploadUrl(storage: ReceiptStorage | undefined, uploadId: string) {
  try {
    if (!storage?.upload?.publishableKey.startsWith("sb_publishable_")) return null;
    const origin = new URL(storage.origin);
    if (!validOrigin(origin)) return null;
    return new URL(`functions/v1/nest-receipt-upload?${new URLSearchParams({ uploadId })}`, origin);
  } catch {
    return null;
  }
}
function statusFailure(status: number) {
  if (status === 401) return failure("session");
  if (status === 403) return failure("forbidden");
  if (status === 409) return failure("conflict");
  if (status === 400 || status === 413) return failure("invalid");
  return failure("unavailable");
}
export function receiptUploadClient(
  storage: ReceiptStorage | undefined,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const session = credentials.pipe(
    Effect.mapError((error) => failure(error.code === "cutover" ? "unavailable" : error.code)),
    Effect.flatMap((value) =>
      value.user.id === account.actor ? Effect.succeed(value) : Effect.fail(failure("session")),
    ),
  );
  return {
    uploadReceipt: (input: ReceiptUploadInput, bytes: Uint8Array) =>
      Effect.gen(function* () {
        const value = canonicalReceiptUpload(
          yield* Schema.decodeUnknownEffect(ReceiptUploadInput)(input, {
            onExcessProperty: "error",
          }).pipe(Effect.mapError(() => failure("invalid"))),
        );
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== value.bytes)
          return yield* failure("invalid");
        const body = new Uint8Array(bytes),
          url = uploadUrl(storage, value.uploadId);
        if (!url) return yield* failure("unavailable");
        yield* session;
        if ((yield* storage!.upload!.digest(body)) !== value.sha256)
          return yield* failure("invalid");
        // Recheck identity after native hashing, before sending any file bytes.
        const current = yield* session;
        const response = yield* HttpClient.post(url, {
          headers: {
            Authorization: `Bearer ${current.access_token}`,
            "X-Nest-Household": account.household,
            apikey: storage!.upload!.publishableKey,
          },
          body: HttpBody.uint8Array(body, value.contentType),
        });
        if (response.status !== 201) return yield* statusFailure(response.status);
        const result = yield* response.json.pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(ReceiptUploadReservation, { onExcessProperty: "error" }),
          ),
        );
        yield* session;
        if (
          !result.stored ||
          result.householdId !== account.household ||
          result.uploaderId !== account.actor ||
          !equivalent(value, result)
        )
          return yield* failure("unavailable");
        return result;
      }).pipe(
        Effect.timeout("40 seconds"),
        Effect.mapError((error) =>
          Schema.is(PreferenceFailure)(error) ? error : failure("unavailable"),
        ),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "error",
          credentials: "omit",
        }),
      ),
  };
}

function validOrigin(origin: URL) {
  const local = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  return (
    (origin.protocol === "https:" || local) &&
    !origin.username &&
    !origin.password &&
    !origin.search &&
    !origin.hash &&
    origin.pathname === "/"
  );
}
