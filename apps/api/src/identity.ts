import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "./errors.ts";

const Uuid = Schema.String.check(Schema.isUUID());
export const Member = Schema.Struct({
  userId: Uuid,
  householdId: Uuid,
  displayName: Schema.String,
});
export type Member = typeof Member.Type;

export class Identity extends Context.Service<
  Identity,
  {
    readonly verify: (token: string) => Effect.Effect<Member, ApiFailure>;
  }
>()("nest/Identity") {}

export function bearerToken(request: Request): Effect.Effect<string, ApiFailure> {
  const value = request.headers.get("authorization");
  if (!value || value.length > 8192)
    return Effect.fail(new ApiFailure({ code: "unauthenticated" }));
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(value);
  return match?.[1]
    ? Effect.succeed(match[1])
    : Effect.fail(new ApiFailure({ code: "unauthenticated" }));
}

export const currentMember = (request: Request) =>
  Effect.gen(function* () {
    const token = yield* bearerToken(request);
    const identity = yield* Identity;
    const member = yield* identity.verify(token);
    const expected = request.headers.get("x-nest-household");
    if (expected !== null && expected.toLowerCase() !== member.householdId.toLowerCase())
      return yield* new ApiFailure({ code: "forbidden" });
    return member;
  });
