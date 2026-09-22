import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveLegacyDismissal,
  ExecuteLegacyDismissal,
  LegacyDismissInput,
  LegacyDismissalReceipt,
  canonicalLegacyDismissal,
} from "@nest/contracts/legacy-draft-dismissal";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(LegacyDismissInput);
export function legacyDismissalCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(
        approved ? ExecuteLegacyDismissal : SaveLegacyDismissal,
      )(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
      const approvalId = Schema.is(ExecuteLegacyDismissal)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase(),
        change = canonicalLegacyDismissal(command.input);
      const raw = yield* requestJson(
        config,
        caller.token,
        approved
          ? "rest/v1/rpc/nest_execute_legacy_dismissal"
          : "rest/v1/rpc/nest_save_legacy_dismissal",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
          p_input: change,
          ...(approved ? { p_approval: approvalId } : {}),
        },
      );
      const result = yield* Schema.decodeUnknownEffect(LegacyDismissalReceipt)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        result.actorId !== caller.member.userId ||
        result.householdId !== caller.member.householdId ||
        result.operationId !== operationId ||
        result.approvalId !== approvalId ||
        !equivalent(result.input, change)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => run(input, false),
    execute: (input: unknown) => run(input, true),
  };
}
