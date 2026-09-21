import { canonicalCorrection } from "@nest/contracts/correction";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CorrectionInput,
  CorrectionReceipt,
  SaveCorrection,
  ExecuteCorrection,
} from "@nest/contracts/correction";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(CorrectionInput);
export function correctionCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(
        approved ? ExecuteCorrection : SaveCorrection,
      )(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(() => new ApiFailure({ code: "invalid_request" })),
      );
      const approvalId = Schema.is(ExecuteCorrection)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase();
      const correction = canonicalCorrection(command.correction);
      const raw = yield* requestJson(
        config,
        caller.token,
        approved ? "rest/v1/rpc/nest_execute_correction" : "rest/v1/rpc/nest_save_correction",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
          p_payload: correction,
          ...(approved ? { p_approval: approvalId } : {}),
        },
      );
      const receipt = yield* Schema.decodeUnknownEffect(CorrectionReceipt)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        receipt.actorId !== caller.member.userId ||
        receipt.householdId !== caller.member.householdId ||
        receipt.operationId !== operationId ||
        receipt.approvalId !== approvalId ||
        !equivalent(receipt.correction, correction)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    save: (input: unknown) => run(input, false),
    execute: (input: unknown) => run(input, true),
  };
}
