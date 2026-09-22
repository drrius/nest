import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RoutineClient } from "../routines/client.ts";
import type { MoneyClient } from "../money/client.ts";
import type { RenewalClient } from "./client.ts";
export function renewalEditorContext(
  account: OfflineAccount,
  clients: { renewals: RenewalClient; routines: RoutineClient; money: MoneyClient },
  target: { renewalId: string | null; after: string | null },
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const [roster, rules, detail] = yield* Effect.all(
      [
        clients.routines.roster(),
        clients.money.recurringRules(target.after),
        target.renewalId === null
          ? Effect.succeed(null)
          : clients.renewals.detail(target.renewalId),
      ],
      { concurrency: 3 },
    );
    const linkedId = detail?.renewal.fields.recurringRuleId;
    const linked = linkedId ? yield* clients.money.recurringRule(linkedId) : null;
    yield* account.store.checkSession(account.session);
    return { members: roster.members, rules, renewal: detail?.renewal ?? null, linked };
  });
}
export type RenewalEditorContext = Effect.Success<ReturnType<typeof renewalEditorContext>>;
