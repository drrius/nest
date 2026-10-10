import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RoutineClient } from "../routines/client.ts";
import type { MealReminderClient } from "./client.ts";
export function reminderEditorContext(
  account: OfflineAccount,
  clients: { routines: RoutineClient; reminders: MealReminderClient },
  entryId: string,
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const [roster, context] = yield* Effect.all(
      [clients.routines.roster(), clients.reminders.detail(entryId)],
      { concurrency: 2 },
    );
    yield* account.store.checkSession(account.session);
    return { ...context, actorId: account.session.actor, members: roster.members };
  });
}
export type ReminderEditorContext = Effect.Success<ReturnType<typeof reminderEditorContext>>;
