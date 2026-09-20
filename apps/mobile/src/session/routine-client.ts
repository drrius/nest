import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { routineClient } from "../routines/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
import type { CreateRoutine, EditRoutine, RoutineStateCommand } from "@nest/contracts/routines";
export function sessionRoutines(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = routineClient(apiUrl, account, sessionCredentials(auth));
  return {
    setState: (input: typeof RoutineStateCommand.Type) =>
      client.setState(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    read: () => client.read().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    edit: (input: EditRoutine) =>
      client.edit(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    create: (input: CreateRoutine) =>
      client.create(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
