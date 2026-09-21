import { canonicalRefund } from "@nest/contracts/refund";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RefundInput, RefundReceipt, SaveRefund, ExecuteRefund } from "@nest/contracts/refund";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(RefundInput);
export function refundCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(approved ? ExecuteRefund : SaveRefund)(
        input,
        { onExcessProperty: "error" },
      ).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
      const approvalId = Schema.is(ExecuteRefund)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase();
      const refund = canonicalRefund(command.refund);
      const raw = yield* requestJson(
        config,
        caller.token,
        approved ? "rest/v1/rpc/nest_execute_refund" : "rest/v1/rpc/nest_save_refund",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
          p_payload: refund,
          ...(approved ? { p_approval: approvalId } : {}),
        },
      );
      const receipt = yield* Schema.decodeUnknownEffect(RefundReceipt)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        receipt.actorId !== caller.member.userId ||
        receipt.householdId !== caller.member.householdId ||
        receipt.operationId !== operationId ||
        receipt.approvalId !== approvalId ||
        !equivalent(receipt.refund, refund)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    save: (input: unknown) => run(input, false),
    execute: (input: unknown) => run(input, true),
  };
}
