import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringDraftContext } from "./recurring-draft.ts";
export function recurringEntryContext(
  account: OfflineAccount,
  client: MoneyClient,
  target: { ruleId: string; editing: boolean },
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const snapshot = target.editing
      ? yield* client.recurringRule(target.ruleId)
      : yield* client.recurringRules(null);
    const balance = yield* client.balance();
    yield* account.store.checkSession(account.session);
    const context: RecurringDraftContext = {
      ruleId: target.ruleId,
      today: snapshot.today,
      current: "rule" in snapshot ? snapshot.rule : null,
      members: [balance.members[0].actorId, balance.members[1].actorId],
    };
    return { context, members: balance.members };
  });
}
export type RecurringEntryContext = Effect.Success<ReturnType<typeof recurringEntryContext>>;
