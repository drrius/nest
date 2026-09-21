import { canonicalRefund } from "@nest/contracts/refund";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RefundInput } from "@nest/contracts/refund";
import {
  DecideRefund,
  RefundApprovalEnvelope,
  RefundApprovalQuery,
} from "@nest/contracts/refund-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type RefundDecision = typeof DecideRefund.Type;
export type RefundApproval = RefundApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(RefundInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function refundApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, RefundApprovalEnvelope, input).pipe(
      Effect.flatMap((result) =>
        requireMatch(
          result.approval,
          result.actorId === account.actor &&
            result.householdId === account.household &&
            result.approval.id === approvalId,
        ),
      ),
    );
  return {
    refundApproval: (approvalId: string) =>
      validate(RefundApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/refund/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideRefund: (input: RefundDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideRefund, input);
        const refund = canonicalRefund(command.refund);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/refund/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          refund,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.refund, refund) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
