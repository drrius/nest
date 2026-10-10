import * as Effect from "effect/Effect";
import type { RenewalList, RenewalEnvelope } from "@nest/contracts/renewals";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RenewalClient } from "./client.ts";
export type RenewalReadTarget =
  | { kind: "list"; after: string | null }
  | { kind: "detail"; renewalId: string };
export type RenewalReadEntry =
  | { kind: "list"; data: typeof RenewalList.Type }
  | { kind: "detail"; data: typeof RenewalEnvelope.Type };
export function renewalReadOperations(account: OfflineAccount, client: RenewalClient) {
  return {
    read: (target: RenewalReadTarget) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const entry: RenewalReadEntry =
          target.kind === "list"
            ? { kind: "list", data: yield* client.list(target.after) }
            : { kind: "detail", data: yield* client.detail(target.renewalId) };
        yield* account.store.checkSession(account.session);
        return entry;
      }),
  };
}
export type RenewalReadOperations = ReturnType<typeof renewalReadOperations>;
