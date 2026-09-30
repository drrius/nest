import * as Schema from "effect/Schema";
import { DecideRecurringResume } from "@nest/contracts/recurring-resume-approval";
import { PreferenceFailure } from "../preferences/client.ts";
import type {
  RecurringApprovalKind,
  RecurringLifecycleApproval,
  RecurringLifecycleDecision,
} from "./recurring-lifecycle-approval.ts";
import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
function read(
  client: MoneyClient,
  id: string,
  kind: RecurringApprovalKind,
): Effect.Effect<RecurringLifecycleApproval, PreferenceFailure> {
  return kind === "resume" ? client.recurringResumeApproval(id) : client.recurringStateApproval(id);
}
function decide(
  client: MoneyClient,
  input: RecurringLifecycleDecision,
  kind: RecurringApprovalKind,
): Effect.Effect<RecurringLifecycleApproval, PreferenceFailure> {
  if (Schema.is(DecideRecurringResume)(input))
    return kind === "resume"
      ? client.decideRecurringResume(input)
      : Effect.fail(new PreferenceFailure({ code: "invalid" }));
  return kind === "state"
    ? client.decideRecurringState(input)
    : Effect.fail(new PreferenceFailure({ code: "invalid" }));
}
export function recurringStateApprovalOperations(
  account: OfflineAccount,
  client: MoneyClient,
  kind: RecurringApprovalKind = "state",
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: (approvalId: string) =>
      account.store.readRecurringStateApproval(account.session, approvalId),
    stage: (attempt: RecurringStateApprovalAttempt, current: () => boolean) =>
      account.store.stageRecurringStateApproval(account.session, attempt, current),
    clear: (attempt: RecurringStateApprovalAttempt) =>
      account.store.clearRecurringStateApproval(account.session, attempt),
    context: (change: RecurringLifecycleApproval["change"]) =>
      checked(client.recurringRule(change.ruleId)).pipe(Effect.map((value) => value.rule)),
    read: (approvalId: string) => checked(read(client, approvalId, kind)),
    decide: (input: RecurringLifecycleDecision) => checked(decide(client, input, kind)),
  };
}
export type RecurringStateApprovalOperations = ReturnType<typeof recurringStateApprovalOperations>;
export type RecurringStateApprovalContext = Effect.Success<
  ReturnType<RecurringStateApprovalOperations["context"]>
>;
