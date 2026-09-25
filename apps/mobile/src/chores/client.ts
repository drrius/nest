import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { ChoreList, ChoreResult, type CompleteChore } from "@nest/contracts/chores";
import { choreTransfers } from "./transfer-client.ts";
import { choreChanges } from "./change-client.ts";
import { preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import { isCutoverFailure } from "../offline/cutover-response.ts";

export class ChoreFailure extends Schema.TaggedError<ChoreFailure>()("ChoreFailure", {
  code: Schema.Literals(["session", "forbidden", "conflict", "cutover", "invalid", "unavailable"]),
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
      if (response.status !== 200) return yield* responseFailure(response);
      return yield* response.json;
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError((error) =>
        Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
  const changes = choreChanges(preferenceRequests(apiUrl, account, credentials), account);
  const transfers = choreTransfers(preferenceRequests(apiUrl, account, credentials), account);
  return {
    snapshot: () =>
      transfers.snapshot().pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
    listTransfers: () =>
      transfers.list().pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
    requestTransfer: (command: Parameters<typeof transfers.request>[0]) =>
      transfers
        .request(command)
        .pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
    respondTransfer: (command: Parameters<typeof transfers.respond>[0]) =>
      transfers
        .respond(command)
        .pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
    skip: (command: Parameters<typeof changes.skip>[0]) =>
      changes
        .skip(command)
        .pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
    reschedule: (command: Parameters<typeof changes.reschedule>[0]) =>
      changes
        .reschedule(command)
        .pipe(Effect.mapError((error) => new ChoreFailure({ code: error.code }))),
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

function responseFailure<E>(response: { status: number; json: Effect.Effect<unknown, E> }) {
  return isCutoverFailure(response).pipe(
    Effect.flatMap((cutover) =>
      Effect.fail(cutover ? new ChoreFailure({ code: "cutover" }) : statusFailure(response.status)),
    ),
  );
}
