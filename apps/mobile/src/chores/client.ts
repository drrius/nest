import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { ChoreList, ChoreResult, type CompleteChore } from "@nest/contracts/chores";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";

export class ChoreFailure extends Schema.TaggedError<ChoreFailure>()("ChoreFailure", {
  code: Schema.Literals(["session", "forbidden", "conflict", "invalid", "unavailable"]),
}) {}
const statusFailure = (status: number) =>
  new ChoreFailure({
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
export function choreClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = (path: string, body?: CompleteChore) =>
    Effect.gen(function* () {
      const session = yield* credentials;
      if (session.user.id !== account.actor) return yield* new ChoreFailure({ code: "session" });
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "X-Nest-Household": account.household,
      };
      const url = new URL(path, apiUrl);
      const response = yield* body
        ? HttpClient.post(url, { headers, body: yield* HttpBody.json(body) })
        : HttpClient.get(url, { headers });
      if (response.status !== 200) return yield* statusFailure(response.status);
      return yield* response.json;
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError((error) =>
        Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
  return {
    list: () =>
      request("v1/chores").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ChoreList)),
        Effect.flatMap((result) =>
          result.householdId === account.household &&
          result.chores.length <= 200 &&
          new Set(result.chores.map((chore) => chore.occurrenceId)).size === result.chores.length
            ? Effect.succeed(result.chores)
            : Effect.fail(new ChoreFailure({ code: "unavailable" })),
        ),
        Effect.mapError((error) =>
          Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
        ),
      ),
    complete: (command: CompleteChore) =>
      request("v1/chores/complete", command).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(ChoreResult)),
        Effect.flatMap(({ receipt, householdId }) =>
          householdId === account.household &&
          receipt.operationId === command.operationId &&
          receipt.occurrenceId === command.occurrenceId
            ? Effect.succeed(receipt)
            : Effect.fail(new ChoreFailure({ code: "unavailable" })),
        ),
        Effect.mapError((error) =>
          Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
        ),
      ),
  };
}
export type ChoreClient = ReturnType<typeof choreClient>;
