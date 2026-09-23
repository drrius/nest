import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  PushDeviceCommand,
  PushDeviceReceipt,
  PushDeviceState,
  PushDeviceRecovery,
  PushDeviceQuery,
  PushDeviceOperationQuery,
  canonicalPushDevice,
  pushDeviceDigestInput,
  matchesPushDeviceReceipt,
} from "@nest/contracts/push-registration";
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
function digest(command: PushDeviceCommand, caller: AuthorizedCaller) {
  return Effect.tryPromise({
    try: async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          pushDeviceDigestInput(command, caller.member.userId, caller.member.householdId),
        ),
      );
      return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      );
    },
    catch: () => new ApiFailure({ code: "unavailable" }),
  });
}
export function pushDeviceService(config: IdentityConfig, caller: AuthorizedCaller) {
  const rpc = <T extends { actorId: string; householdId: string }>(
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
        result.actorId !== caller.member.userId
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) =>
      Effect.gen(function* () {
        const command = canonicalPushDevice(
          yield* decode(PushDeviceCommand, input, "invalid_request"),
        );
        const commandDigest = yield* digest(command, caller);
        const result = yield* rpc(PushDeviceReceipt, "nest_save_push_device", { p_input: command });
        if (
          !matchesPushDeviceReceipt(result, command, {
            actorId: caller.member.userId,
            householdId: caller.member.householdId,
            commandDigest,
          })
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(PushDeviceQuery, input, "invalid_request");
        const id = query.installationId.toLowerCase();
        const result = yield* rpc(PushDeviceState, "nest_read_push_device", { p_installation: id });
        if (result.installationId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    cancel: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(PushDeviceOperationQuery, input, "invalid_request");
        const id = query.operationId.toLowerCase();
        const result = yield* rpc(PushDeviceRecovery, "nest_cancel_push_device_operation", {
          p_operation: id,
        });
        if (result.operationId !== id || result.status === "unresolved")
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    recover: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(PushDeviceOperationQuery, input, "invalid_request");
        const id = query.operationId.toLowerCase();
        const result = yield* rpc(PushDeviceRecovery, "nest_read_push_device_operation", {
          p_operation: id,
        });
        if (result.operationId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
