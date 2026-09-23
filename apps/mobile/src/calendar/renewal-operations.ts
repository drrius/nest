import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { CalendarClient } from "./client.ts";
export function calendarRenewalOperations(account: OfflineAccount, client: CalendarClient) {
  return {
    read: (date: string, after: string | null) =>
      Effect.gen(function* () {
        yield* account.store.readAgendaSelection(account.session);
        const renewals = yield* client.renewals({ date, after });
        yield* account.store.readAgendaSelection(account.session);
        return renewals;
      }),
  };
}
export type CalendarRenewalOperations = ReturnType<typeof calendarRenewalOperations>;
