import { canonicalVariableCycle } from "@nest/contracts/recurring-variable";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { VariableCycleInput } from "@nest/contracts/recurring-variable";
import {
  DecideVariableCycle,
  VariableCycleApprovalEnvelope,
  VariableCycleApprovalQuery,
} from "@nest/contracts/recurring-variable-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type VariableCycleDecision = typeof DecideVariableCycle.Type;
export type VariableCycleApproval = VariableCycleApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(VariableCycleInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function variableCycleApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, VariableCycleApprovalEnvelope, input).pipe(
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
    variableCycleApproval: (approvalId: string) =>
      validate(VariableCycleApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/recurring/variable/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideVariableCycle: (input: VariableCycleDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideVariableCycle, input);
        const cycle = canonicalVariableCycle(command.input);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/recurring/variable/approval/decide", approvalId, {
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
