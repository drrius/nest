import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { FoodProfileEnvelope, FoodSaveEnvelope, SaveFoodPreferences } from "@nest/contracts/food";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";

export class FoodFailure extends Schema.TaggedError<FoodFailure>()("FoodFailure", {
  code: Schema.Literals(["session", "forbidden", "conflict", "invalid", "unavailable"]),
}) {}
const unavailable = () => new FoodFailure({ code: "unavailable" });
const normalize = (error: unknown) => (Schema.is(FoodFailure)(error) ? error : unavailable());
const statusFailure = (status: number) =>
  new FoodFailure({
    code:
      status === 401
        ? "session"
        : status === 403
          ? "forbidden"
          : status === 409
            ? "conflict"
            : status === 400
              ? "invalid"
              : "unavailable",
  });
export function foodClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = <A>(path: string, schema: Schema.Codec<A>, body?: SaveFoodPreferences) =>
    Effect.gen(function* () {
      const session = yield* credentials.pipe(
        Effect.mapError((error) => new FoodFailure({ code: error.code })),
      );
      if (session.user.id !== account.actor) return yield* new FoodFailure({ code: "session" });
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "X-Nest-Household": account.household,
      };
      const url = new URL(path, apiUrl);
      const response = yield* body
        ? HttpClient.post(url, { headers, body: yield* HttpBody.json(body) })
        : HttpClient.get(url, { headers });
      if (response.status !== 200) return yield* statusFailure(response.status);
      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })),
      );
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError(normalize),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "error",
        credentials: "omit",
      }),
    );
  return {
    read: () =>
      request("v1/food-preferences", FoodProfileEnvelope).pipe(
        Effect.flatMap((value) =>
          value.actorId === account.actor &&
          value.householdId === account.household &&
          value.profile?.revision !== "0"
            ? Effect.succeed(value.profile)
            : Effect.fail(unavailable()),
        ),
      ),
    save: (input: SaveFoodPreferences) =>
      Schema.decodeUnknownEffect(SaveFoodPreferences, { onExcessProperty: "error" })(input).pipe(
        Effect.mapError(() => new FoodFailure({ code: "invalid" })),
        Effect.flatMap((command) => request("v1/food-preferences/save", FoodSaveEnvelope, command)),
        Effect.flatMap(({ receipt }) =>
          receipt.actorId === account.actor &&
          receipt.householdId === account.household &&
          receipt.operationId === input.operationId.toLowerCase() &&
          BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n
            ? Effect.succeed(receipt)
            : Effect.fail(unavailable()),
        ),
      ),
  };
}
export type FoodClient = ReturnType<typeof foodClient>;
