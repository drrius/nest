import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ReceiptMetadata,
  ReceiptTarget,
  ReceiptLink,
  canonicalReceiptTarget,
} from "@nest/contracts/receipt";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const equivalent = Schema.toEquivalence(ReceiptTarget);
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function receiptClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  storageOrigin?: string,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const target = (input: ReceiptTarget) =>
    Schema.decodeUnknownEffect(ReceiptTarget)(input, { onExcessProperty: "error" }).pipe(
      Effect.map(canonicalReceiptTarget),
      Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
    );
  const check = (metadata: ReceiptMetadata, query: ReceiptTarget) => {
    if (metadata.householdId !== account.household || !equivalent(metadata.target, query))
      return false;
    return !("receiptPath" in query) || metadata.receipt?.path === query.receiptPath;
  };
  return {
    receipt: (input: ReceiptTarget) =>
      Effect.gen(function* () {
        const query = yield* target(input);
        const value = yield* request(
          `v1/money/receipt?${new URLSearchParams(query)}`,
          ReceiptMetadata,
        );
        if (!check(value, query)) return yield* unavailable();
        return value;
      }),
    receiptLink: (input: ReceiptTarget) =>
      Effect.gen(function* () {
        const query = yield* target(input);
        if (!storageOrigin) return yield* unavailable();
        const value = yield* request(
          `v1/money/receipt/link?${new URLSearchParams(query)}`,
          ReceiptLink,
        );
        if (!check(value.metadata, query) || !validReceiptLink(value, storageOrigin))
          return yield* unavailable();
        return value;
      }),
  };
}
export function validReceiptLink(value: typeof ReceiptLink.Type, origin: string) {
  if (!value.metadata.receipt) return false;
  try {
    const url = new URL(value.url),
      base = new URL(origin);
    return (
      sameOrigin(url, base) &&
      url.pathname === `/storage/v1/object/sign/household-files/${value.metadata.receipt.path}` &&
      url.searchParams.size === 1 &&
      /^[A-Za-z0-9_.-]+$/.test(url.searchParams.get("token") ?? "") &&
      Number.isFinite(Date.parse(value.expiresAt))
    );
  } catch {
    return false;
  }
}

function sameOrigin(url: URL, base: URL) {
  return url.origin === base.origin && !url.username && !url.password && !url.hash;
}
