import { RefundContext, RefundContextQuery } from "@nest/contracts/refund";
import { RefundSaveResult } from "@nest/contracts/refund-save-read";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveRefund, RefundInput, RefundReceipt } from "@nest/contracts/refund";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import { canonicalRefund } from "@nest/contracts/refund";
export type RefundSave = typeof SaveRefund.Type;
const equivalent = Schema.toEquivalence(RefundInput);
export function refundClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: RefundSave, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* prepare(input);
      const value = yield* cancel
        ? request("v1/money/refund/cancel", RefundSaveResult, {
            operationId: command.operationId,
          })
        : request(
            `v1/money/refund/receipt?${new URLSearchParams({ operationId: command.operationId })}`,
            RefundSaveResult,
          );
      if (
        value.actorId !== account.actor ||
        value.householdId !== account.household ||
        value.operationId !== command.operationId
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (value.receipt !== null && !equivalent(value.receipt.refund, command.refund))
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (cancel && value.status === "unresolved")
        return yield* new PreferenceFailure({ code: "unavailable" });
      return value;
    });
  return {
    refundContext: (sourceEventId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(RefundContextQuery)({ sourceEventId }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const source = query.sourceEventId.toLowerCase();
        const value = yield* request(
          `v1/money/refund/context?${new URLSearchParams({ sourceEventId: source })}`,
          RefundContext,
        );
        if (
          value.householdId !== account.household ||
          value.source.event.eventId !== source ||
          !value.remaining.some((share) => share.memberId === account.actor)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return value;
      }),
    recoverRefund: (input: RefundSave) => status(input, false),
    cancelRefund: (input: RefundSave) => status(input, true),
    saveRefund: (input: RefundSave) =>
      Effect.gen(function* () {
        const { operationId, refund } = yield* prepare(input);
        const receipt = yield* request("v1/money/refund/save", RefundReceipt, {
          operationId,
          refund,
        });
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== operationId ||
          receipt.approvalId !== null ||
          !equivalent(receipt.refund, refund)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}

function prepare(input: RefundSave) {
  return Schema.decodeUnknownEffect(SaveRefund)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
    Effect.map((command) => ({
      operationId: command.operationId.toLowerCase(),
      refund: canonicalRefund(command.refund),
    })),
  );
}
