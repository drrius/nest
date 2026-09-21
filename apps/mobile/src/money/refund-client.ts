import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRefund,
  RefundInput,
  RefundReceipt,
  RefundContext,
  RefundContextQuery,
  canonicalRefund,
} from "@nest/contracts/refund";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type RefundSave = typeof SaveRefund.Type;
const equivalent = Schema.toEquivalence(RefundInput);
export function refundClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
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
    saveRefund: (input: RefundSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveRefund)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          refund = canonicalRefund(command.refund);
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
