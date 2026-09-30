import { canonicalRecurringResume } from "@nest/contracts/recurring-resume";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RecurringResumeInput } from "@nest/contracts/recurring-resume";
import {
  DecideRecurringResume,
  RecurringResumeApprovalEnvelope,
  RecurringResumeApprovalQuery,
} from "@nest/contracts/recurring-resume-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type RecurringResumeDecision = typeof DecideRecurringResume.Type;
export type RecurringResumeApproval = RecurringResumeApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(RecurringResumeInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function recurringResumeApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, RecurringResumeApprovalEnvelope, input).pipe(
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
    recurringResumeApproval: (approvalId: string) =>
      validate(RecurringResumeApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/recurring/resume/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideRecurringResume: (input: RecurringResumeDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideRecurringResume, input);
        const change = canonicalRecurringResume(command.change);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped("v1/money/recurring/resume/approval/decide", approvalId, {
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
