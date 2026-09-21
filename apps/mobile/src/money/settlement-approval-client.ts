import { canonicalSettlement } from "@nest/contracts/settlement";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SettlementInput } from "@nest/contracts/settlement";
import {
  DecideSettlement,
  SettlementApprovalEnvelope,
  SettlementApprovalQuery,
} from "@nest/contracts/settlement-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type SettlementDecision = typeof DecideSettlement.Type;
export type SettlementApproval = SettlementApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(SettlementInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function settlementApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, SettlementApprovalEnvelope, input).pipe(
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
    settlementApproval: (approvalId: string) =>
      validate(SettlementApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/settlement/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideSettlement: (input: SettlementDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideSettlement, input);
        const settlement = canonicalSettlement(command.settlement);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/settlement/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          settlement,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.settlement, settlement) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
