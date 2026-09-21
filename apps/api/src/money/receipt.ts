import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReceiptMetadata, ReceiptTarget, canonicalReceiptTarget } from "@nest/contracts/receipt";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(ReceiptTarget);
export function readReceipt(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReceiptTarget)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const target = canonicalReceiptTarget(query);
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_receipt", {
      p_household: caller.member.householdId,
      p_event: "eventId" in target ? target.eventId : null,
      p_path: "receiptPath" in target ? target.receiptPath : null,
    });
    const value = yield* Schema.decodeUnknownEffect(ReceiptMetadata)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (value.householdId !== caller.member.householdId || !equivalent(target, value.target))
      return yield* new ApiFailure({ code: "unavailable" });
    if ("receiptPath" in target && value.receipt?.path !== target.receiptPath)
      return yield* new ApiFailure({ code: "unavailable" });
    return value;
  });
}
const Signed = Schema.Struct({ signedURL: Schema.String.check(Schema.isMaxLength(8192)) });
export function receiptLink(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const metadata = yield* readReceipt(config, caller, input);
    if (!metadata.receipt) return yield* new ApiFailure({ code: "removed" });
    const path = metadata.receipt.path;
    const started = yield* Clock.currentTimeMillis;
    const raw = yield* requestJson(
      config,
      caller.token,
      `storage/v1/object/sign/household-files/${path}`,
      { expiresIn: 60 },
    );
    const value = yield* Schema.decodeUnknownEffect(Signed)(raw).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    const url = signedReceiptUrl(config.url, path, value.signedURL);
    if (url === null) return yield* new ApiFailure({ code: "unavailable" });
    return { metadata, url, expiresAt: new Date(started + 60_000).toISOString() };
  });
}
export function signedReceiptUrl(origin: string, path: string, signed: string) {
  const prefix = `/object/sign/household-files/${path}?`;
  if (!signed.startsWith(prefix)) return null;
  const query = new URLSearchParams(signed.slice(prefix.length));
  if (query.size !== 1 || !query.has("token") || !/^[A-Za-z0-9_.-]+$/.test(query.get("token")!))
    return null;
  return new URL(`storage/v1${signed}`, origin).href;
}
