import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { RenewalCommand, SaveRenewal, RemoveRenewal } from "@nest/contracts/renewals";
import { renewalClient } from "../renewals/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionRenewals(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = renewalClient(apiUrl, account, sessionCredentials(auth));
  return {
    list: (after: string | null = null) =>
      client.list(after).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    detail: (renewalId: string) =>
      client.detail(renewalId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveRenewal.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    remove: (input: typeof RemoveRenewal.Type) =>
      client.remove(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: RenewalCommand) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: RenewalCommand) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
