import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { CalendarClient } from "./client.ts";
export function calendarChoreOperations(account: OfflineAccount, client: CalendarClient) {
  return {
    read: (date: string) =>
      Effect.gen(function* () {
        yield* account.store.readAgendaSelection(account.session);
        const chores = yield* client.chores(date);
        yield* account.store.readAgendaSelection(account.session);
        return chores;
      }),
  };
}
export type CalendarChoreOperations = ReturnType<typeof calendarChoreOperations>;
