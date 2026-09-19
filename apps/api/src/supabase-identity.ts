import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { ApiFailure } from "./errors.ts";
import { Identity } from "./identity.ts";

const Uuid = Schema.String.check(Schema.isUUID());
const AuthUser = Schema.Struct({ id: Uuid, is_anonymous: Schema.optional(Schema.Boolean) });
const Memberships = Schema.Array(
  Schema.Struct({
    user_id: Uuid,
    household_id: Uuid,
    display_name: Schema.NullOr(Schema.String),
  }),
);

export type IdentityConfig = {
  readonly url: string;
  readonly publishableKey: string;
};

function jsonRequest(url: URL, headers: Record<string, string>) {
  return Effect.gen(function* () {
    const response = yield* HttpClient.get(url, { headers });
    if (response.status === 401 || response.status === 403) {
      return yield* new ApiFailure({ code: "unauthenticated" });
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* new ApiFailure({ code: "unavailable" });
    }
    return yield* response.json;
  }).pipe(
    Effect.timeout("10 seconds"),
    Effect.mapError((cause) =>
      Schema.is(ApiFailure)(cause) ? cause : new ApiFailure({ code: "unavailable" }),
    ),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
  );
}

function verifyMember(config: IdentityConfig, token: string) {
  return Effect.gen(function* () {
    const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };
    const rawUser = yield* jsonRequest(new URL("auth/v1/user", config.url), headers);
    const user = yield* Schema.decodeUnknownEffect(AuthUser)(rawUser).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    if (user.is_anonymous) return yield* new ApiFailure({ code: "unauthenticated" });
    const query = new URL("rest/v1/household_members", config.url);
    query.search = new URLSearchParams({
      select: "user_id,household_id,display_name",
      user_id: `eq.${user.id}`,
      limit: "2",
    }).toString();
    const rawMembers = yield* jsonRequest(query, headers);
    const members = yield* Schema.decodeUnknownEffect(Memberships)(rawMembers).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    const member = members[0];
    if (members.length !== 1 || !member || member.user_id !== user.id) {
      return yield* new ApiFailure({ code: "not_a_member" });
    }
    return {
      userId: user.id,
      householdId: member.household_id,
      displayName: member.display_name ?? "",
    };
  });
}

export function supabaseIdentity(config: IdentityConfig) {
  return Layer.succeed(Identity, { verify: (token) => verifyMember(config, token) });
}
