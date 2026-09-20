import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Memory, MemoryApproval, MemoriesEnvelope } from "@nest/contracts/memory";
import { ApiFailure } from "../errors.ts";
import { requestDocument } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode, completeRange } from "./codec.ts";
const Owner = { actorId: Schema.String, householdId: Schema.String };
const Row = Schema.Struct({ ...Owner, ...Memory.fields });
const ApprovalRow = Schema.Struct({
  ...Owner,
  ...MemoryApproval.fields,
  command: Schema.Literal("memory.save"),
  commandVersion: Schema.Literal(1),
});
export function memoryReads(config: IdentityConfig, caller: AuthorizedCaller) {
  const { userId: actorId, householdId } = caller.member;
  const filters = { actor_id: `eq.${actorId}`, household_id: `eq.${householdId}` };
  const own = (row: { actorId: string; householdId: string }) =>
    row.actorId === actorId && row.householdId === householdId;
  return {
    list: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          ...filters,
          content: "not.is.null",
          order: "id.asc",
          limit: "64",
          select: "actorId:actor_id,householdId:household_id,id,revision:revision::text,content",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_memories?${query}`,
        );
        const rows = yield* decode(Schema.Array(Row).check(Schema.isMaxLength(64)), document.value);
        if (!completeRange(document.range, rows.length) || !rows.every(own))
          return yield* new ApiFailure({ code: "unavailable" });
        return yield* decode(MemoriesEnvelope, {
          version: 1,
          actorId,
          householdId,
          memories: rows.map(({ id, revision, content }) => ({ id, revision, content })),
        });
      }),
    approval: (id: string) =>
      Effect.gen(function* () {
        const key = yield* decode(Schema.String.check(Schema.isUUID()), id, "invalid_request");
        const query = new URLSearchParams({
          ...filters,
          id: `eq.${key.toLowerCase()}`,
          command: "eq.memory.save",
          limit: "1",
          select:
            "actorId:actor_id,householdId:household_id,id,operationId:invocation_id,change:payload,status,expiresAt:expires_at,command,commandVersion:command_version",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_action_approvals?${query}`,
        );
        const rows = yield* decode(
          Schema.Array(ApprovalRow).check(Schema.isMaxLength(1)),
          document.value,
        );
        if (!completeRange(document.range, rows.length))
          return yield* new ApiFailure({ code: "unavailable" });
        if (!rows.length) return yield* new ApiFailure({ code: "forbidden" });
        const row = rows[0]!;
        if (!own(row) || row.id !== key.toLowerCase())
          return yield* new ApiFailure({ code: "unavailable" });
        return {
          id: row.id,
          operationId: row.operationId,
          change: row.change,
          status: row.status,
          expiresAt: row.expiresAt,
        };
      }),
  };
}
