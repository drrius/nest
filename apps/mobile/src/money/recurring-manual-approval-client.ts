import { canonicalManualCycle } from "@nest/contracts/recurring-manual";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManualCycleInput } from "@nest/contracts/recurring-manual";
import {
  DecideManualCycle,
  ManualCycleApprovalEnvelope,
  ManualCycleApprovalQuery,
} from "@nest/contracts/recurring-manual-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type ManualCycleDecision = typeof DecideManualCycle.Type;
export type ManualCycleApproval = ManualCycleApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(ManualCycleInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function manualCycleApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, ManualCycleApprovalEnvelope, input).pipe(
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
    manualCycleApproval: (approvalId: string) =>
      validate(ManualCycleApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/recurring/manual/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideManualCycle: (input: ManualCycleDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideManualCycle, input);
        const cycle = canonicalManualCycle(command.input);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/recurring/manual/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          input: cycle,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.input, cycle) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
