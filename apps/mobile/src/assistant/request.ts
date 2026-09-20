import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ChoreFailure } from "../chores/client.ts";
import type { Credentials } from "../session/verification.ts";
import type { Account } from "../offline/contracts.ts";

export class AssistantFailure extends Schema.TaggedError<AssistantFailure>()("AssistantFailure", {
  code: Schema.Literals(["session", "forbidden", "conflict", "missing", "invalid", "unavailable"]),
}) {}
export const failure = (status: number) =>
  new AssistantFailure({
    code:
      status === 401
        ? "session"
        : status === 403
          ? "forbidden"
          : status === 409
            ? "conflict"
            : status === 410
              ? "missing"
              : status === 400
                ? "invalid"
                : "unavailable",
  });
export function assistantRequests(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  fetcher: typeof globalThis.fetch,
) {
  const authorized = async (path: string, init: RequestInit = {}) => {
    const session = await Effect.runPromise(
      credentials.pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError(
          (error) =>
            new AssistantFailure({
              code: "code" in error && error.code === "session" ? "session" : "unavailable",
            }),
        ),
      ),
      {
        signal: init.signal ?? undefined,
      },
    );
    if (session.user.id !== account.actor) throw new AssistantFailure({ code: "session" });
    init.signal?.throwIfAborted();
    return fetcher(new URL(path, apiUrl), {
      ...init,
      credentials: "omit",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Nest-Household": account.household,
      },
    });
  };
  const json = <A>(path: string, schema: Schema.Codec<A>, body?: object) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await authorized(path, {
          signal,
          method: body ? "POST" : "GET",
          body: body ? JSON.stringify(body) : undefined,
        });
        if (response.status !== 200) throw failure(response.status);
        const text = await response.text();
        if (new TextEncoder().encode(text).length > 2200000) throw failure(503);
        return Schema.decodeUnknownSync(schema)(JSON.parse(text));
      },
      catch: (error) => (Schema.is(AssistantFailure)(error) ? error : failure(503)),
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError((error) => (Schema.is(AssistantFailure)(error) ? error : failure(503))),
    );
  return { authorized, json };
}
