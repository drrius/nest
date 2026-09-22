import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RenewalCommand,
  SaveRenewal,
  RemoveRenewal,
  RenewalReceipt,
  RenewalEnvelope,
  RenewalList,
  RenewalRecovery,
  RenewalQuery,
  RenewalListQuery,
  RenewalOperationQuery,
  canonicalRenewalCommand,
  sameRenewalCommand,
} from "@nest/contracts/renewals";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
const decode = <T>(
  schema: Schema.Codec<T>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function renewalService(config: IdentityConfig, caller: AuthorizedCaller) {
  const rpc = <T extends { householdId: string }>(
    schema: Schema.Codec<T>,
    name: string,
    payload: object,
  ) =>
    Effect.gen(function* () {
      const raw = yield* requestJson(config, caller.token, `rest/v1/rpc/${name}`, {
        p_household: caller.member.householdId,
        ...payload,
      });
      const result = yield* decode(schema, raw, "unavailable");
      if (
        result.householdId !== caller.member.householdId ||
        ("actorId" in result && result.actorId !== caller.member.userId)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  const change = (input: unknown, remove: boolean) =>
    Effect.gen(function* () {
      const command = canonicalRenewalCommand(
        yield* decode<typeof RenewalCommand.Type>(
          remove ? RemoveRenewal : SaveRenewal,
          input,
          "invalid_request",
        ),
      );
      const { operationId, ...p_input } = command;
      const result = yield* rpc(
        RenewalReceipt,
        remove ? "nest_remove_renewal" : "nest_save_renewal",
        { p_operation: operationId, p_input },
      );
      if (!sameRenewalCommand(result.command, command))
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => change(input, false),
    remove: (input: unknown) => change(input, true),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(RenewalQuery, input, "invalid_request"),
          id = query.renewalId.toLowerCase();
        const result = yield* rpc(RenewalEnvelope, "nest_read_renewal", { p_renewal: id });
        if (result.renewal.renewalId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    list: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(RenewalListQuery, input, "invalid_request"),
          after = query.after?.toLowerCase() ?? null;
        const result = yield* rpc(RenewalList, "nest_list_renewals", { p_after: after });
        if (result.after !== after) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    recover: (input: unknown, cancel: boolean) =>
      Effect.gen(function* () {
        const query = yield* decode(RenewalOperationQuery, input, "invalid_request"),
          operationId = query.operationId.toLowerCase();
        const result = yield* rpc(
          RenewalRecovery,
          cancel ? "nest_cancel_renewal_operation" : "nest_read_renewal_operation",
          { p_operation: operationId },
        );
        if (result.operationId !== operationId)
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
