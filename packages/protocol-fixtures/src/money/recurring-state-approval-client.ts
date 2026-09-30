import { canonicalRecurringState } from "@nest/contracts/recurring-state";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RecurringStateInput } from "@nest/contracts/recurring-state";
import {
  DecideRecurringState,
  RecurringStateApprovalEnvelope,
  RecurringStateApprovalQuery,
} from "@nest/contracts/recurring-state-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type RecurringStateDecision = typeof DecideRecurringState.Type;
export type RecurringStateApproval = RecurringStateApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(RecurringStateInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function recurringStateApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, RecurringStateApprovalEnvelope, input).pipe(
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
    recurringStateApproval: (approvalId: string) =>
      validate(RecurringStateApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/recurring/state/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideRecurringState: (input: RecurringStateDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideRecurringState, input);
        const change = canonicalRecurringState(command.change);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/recurring/state/approval/decide", approvalId, {
          ...command,
          approvalId,
          operationId,
          change,
        });
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.change, change) &&
            result.status === (command.approved ? "consumed" : "denied"),
        );
      }),
  };
}
