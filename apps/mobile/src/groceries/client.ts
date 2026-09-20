import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import {
  GroceryList,
  GroceryCheckReceipt,
  Uuid,
  type CheckGrocery,
} from "@nest/contracts/groceries";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";

export class GroceryFailure extends Schema.TaggedError<GroceryFailure>()("GroceryFailure", {
  code: Schema.Literals(["session", "forbidden", "conflict", "removed", "invalid", "unavailable"]),
}) {}
const statusCodes: Readonly<Record<number, GroceryFailure["code"]>> = {
  401: "session",
  403: "forbidden",
  409: "conflict",
  410: "removed",
  400: "invalid",
};
const failure = (status: number) =>
  new GroceryFailure({ code: statusCodes[status] ?? "unavailable" });
const Result = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  receipt: GroceryCheckReceipt,
});
const safe = (error: unknown) =>
  Schema.is(GroceryFailure)(error) ? error : new GroceryFailure({ code: "unavailable" });
export function groceryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = (path: string, body?: typeof CheckGrocery.Type) =>
    Effect.gen(function* () {
      const session = yield* credentials.pipe(
        Effect.mapError((error) => new GroceryFailure({ code: error.code })),
      );
      if (session.user.id !== account.actor) return yield* new GroceryFailure({ code: "session" });
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "X-Nest-Household": account.household,
      };
      const url = new URL(path, apiUrl);
      const response = yield* body
        ? HttpClient.post(url, { headers, body: yield* HttpBody.json(body) })
        : HttpClient.get(url, { headers });
      if (response.status !== 200) return yield* failure(response.status);
      return yield* response.json;
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError(safe),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
  return {
    list: () =>
      request("v1/groceries").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(GroceryList)),
        Effect.flatMap((result) =>
          result.householdId === account.household &&
          result.groceries.length <= 500 &&
          new Set(result.groceries.map((row) => row.itemId)).size === result.groceries.length
            ? Effect.succeed(result.groceries)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
    check: (command: typeof CheckGrocery.Type) =>
      request("v1/groceries/check", command).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Result)),
        Effect.flatMap(({ householdId, receipt }) =>
          householdId === account.household &&
          receipt.target === command.itemId &&
          receipt.operation === command.operationId &&
          receipt.checked === command.checked
            ? Effect.succeed(receipt)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
  };
}
export type GroceryClient = ReturnType<typeof groceryClient>;
