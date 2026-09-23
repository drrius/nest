import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { PushDeviceCommand } from "@nest/contracts/push-registration";
import { pushDeviceClient } from "../push/client";
import { nativePushDigest } from "../push/digest";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionPushDevices(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = pushDeviceClient(apiUrl, account, sessionCredentials(auth), nativePushDigest);
  return {
    detail: (installationId: string) =>
      client.detail(installationId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: PushDeviceCommand) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: PushDeviceCommand) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: PushDeviceCommand) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
