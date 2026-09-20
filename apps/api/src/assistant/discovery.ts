import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ConversationSummary, ConversationPage } from "@nest/contracts/conversations";
import { ApiFailure } from "../errors.ts";
import { requestDocument } from "../supabase-request.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";

const Cursor = Schema.NullOr(Schema.String.check(Schema.isUUID()));
const Row = Schema.Struct({
  ...ConversationSummary.fields,
  actorId: Schema.String,
  householdId: Schema.String,
});
const decode = <A>(schema: Schema.Codec<A>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
  );

export function discoverConversations(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  const read = (filters: Record<string, string>) =>
    Effect.gen(function* () {
      const query = new URLSearchParams({
        select:
          "conversationId:id,actorId:actor_id,householdId:household_id,revision:revision::text,createdAt:created_at,updatedAt:updated_at",
        actor_id: `eq.${caller.member.userId}`,
        household_id: `eq.${caller.member.householdId}`,
        ...filters,
      });
      const document = yield* requestDocument(
        config,
        caller.token,
        `rest/v1/nest_ai_conversations?${query}`,
      );
      const rows = yield* decode(Schema.Array(Row), document.value);
      const total = Number(document.range?.match(/\/(\d+)$/)?.[1]);
      const expected = rows.length === 0 ? "*/0" : `0-${rows.length - 1}/${total}`;
      if (
        !Number.isSafeInteger(total) ||
        document.range !== expected ||
        rows.length !== Math.min(Number(filters.limit), total) ||
        new Set(rows.map((row) => row.conversationId)).size !== rows.length ||
        rows.some(
          (row) =>
            row.actorId !== caller.member.userId || row.householdId !== caller.member.householdId,
        )
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return rows;
    });
  return Effect.gen(function* () {
    const cursor = yield* Schema.decodeUnknownEffect(Cursor)(
      new URL(request.url).searchParams.get("cursor"),
    ).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    let filter: Record<string, string> = {};
    if (cursor) {
      const [anchor] = yield* read({ id: `eq.${cursor.toLowerCase()}`, limit: "1" });
      if (!anchor) return yield* new ApiFailure({ code: "removed" });
      if (anchor.conversationId !== cursor.toLowerCase())
        return yield* new ApiFailure({ code: "unavailable" });
      filter = {
        or: `(created_at.lt.${anchor.createdAt},and(created_at.eq.${anchor.createdAt},id.lt.${anchor.conversationId}))`,
      };
    }
    const rows = yield* read({ ...filter, order: "created_at.desc,id.desc", limit: "21" });
    const conversations = rows
      .slice(0, 20)
      .map(({ actorId: _actor, householdId: _household, ...summary }) => summary);
    return yield* decode(ConversationPage, {
      version: 1,
      actorId: caller.member.userId,
      householdId: caller.member.householdId,
      conversations,
      nextCursor: rows.length > 20 ? conversations.at(-1)!.conversationId : null,
    });
  });
}
