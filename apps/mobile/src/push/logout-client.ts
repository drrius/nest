import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { PushSessionRevocation } from "@nest/contracts/push-registration";
import type { SessionConfig } from "../session/config.ts";
import { SessionFailure } from "../session/contracts.ts";
import { tokenIdentity } from "../session/token-identity.ts";

const unavailable = () => new SessionFailure({ code: "unavailable" });

// Parsing supplies receipt expectations only. PostgREST verifies the signature;
// decoded claims never grant authority or restore a local signed-in identity.
const receiptIdentity = (token: string) =>
  Effect.try({ try: () => tokenIdentity(token), catch: unavailable });

// Explicit idempotent cleanup with the retained logout token. Does not consult
// SDK hydration or require membership, prompt permission, or refresh credentials.
export function revokePushSession(config: SessionConfig, token: string) {
  return Effect.gen(function* () {
    const expected = yield* receiptIdentity(token);
    const response = yield* HttpClient.post(
      new URL("rest/v1/rpc/nest_revoke_push_session", config.supabaseUrl),
      {
        headers: { Authorization: `Bearer ${token}`, apikey: config.publishableKey },
        body: yield* HttpBody.json({}),
      },
    );
    if (response.status !== 200) return yield* unavailable();
    const receipt = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(PushSessionRevocation, { onExcessProperty: "error" }),
      ),
    );
    if (receipt.actorId !== expected.actor || receipt.sessionId !== expected.session)
      return yield* unavailable();
    return receipt;
  }).pipe(
    Effect.timeout("15 seconds"),
    Effect.mapError(unavailable),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", credentials: "omit" }),
  );
}
