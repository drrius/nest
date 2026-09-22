import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RoutineClient } from "../routines/client.ts";
import type { RenewalClient } from "../renewals/client.ts";
import type { RenewalReminderClient } from "./client.ts";
export function reminderEditorContext(
  account: OfflineAccount,
  clients: { renewals: RenewalClient; routines: RoutineClient; reminders: RenewalReminderClient },
  renewalId: string,
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const [roster, detail, reminder] = yield* Effect.all(
      [
        clients.routines.roster(),
        clients.renewals.detail(renewalId),
        clients.reminders.detail(renewalId),
      ],
      { concurrency: 3 },
    );
    yield* account.store.checkSession(account.session);
    return {
      actorId: account.session.actor,
      members: roster.members,
      renewal: detail.renewal,
      reminder: reminder.reminder,
    };
  });
}
export type ReminderEditorContext = Effect.Success<ReturnType<typeof reminderEditorContext>>;
