import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { CalendarClient } from "./client.ts";
export function partnerOperations(account: OfflineAccount, client: CalendarClient) {
  return {
    actor: account.session.actor,
    read: () =>
      Effect.gen(function* () {
        yield* account.store.readAgendaSelection(account.session);
        const snapshots = yield* client.snapshots();
        yield* account.store.readAgendaSelection(account.session);
        return snapshots;
      }),
  };
}
export type PartnerOperations = ReturnType<typeof partnerOperations>;
