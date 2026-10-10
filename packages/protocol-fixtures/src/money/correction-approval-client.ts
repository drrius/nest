import { canonicalCorrection } from "@nest/contracts/correction";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CorrectionInput } from "@nest/contracts/correction";
import {
  DecideCorrection,
  CorrectionApprovalEnvelope,
  CorrectionApprovalQuery,
} from "@nest/contracts/correction-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type CorrectionDecision = typeof DecideCorrection.Type;
export type CorrectionApproval = CorrectionApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(CorrectionInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function correctionApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, CorrectionApprovalEnvelope, input).pipe(
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
    correctionApproval: (approvalId: string) =>
      validate(CorrectionApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/correction/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideCorrection: (input: CorrectionDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideCorrection, input);
        const correction = canonicalCorrection(command.correction);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/correction/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          correction,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.correction, correction) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
