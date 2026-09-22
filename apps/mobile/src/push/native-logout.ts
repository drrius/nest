import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { logoutCredentials } from "../session/native-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshLogoutCredentials } from "../session/refresh-logout";
import type { SessionConfig } from "../session/config";
import { readNativePushInstallation } from "./native-storage";
import { pushLogoutCleanup } from "./logout-cleanup";
import { revokePushSession } from "./logout-client";

export const finishNativePushLogout =
  (config: SessionConfig, auth: SupabaseClient["auth"]) =>
  async (token: string | null | void): Promise<string | null> => {
    if (await logoutCredentials.completed()) return token ?? null;
    const installation = await readNativePushInstallation();
    if (installation === null) {
      await logoutCredentials.complete(token ?? null);
      return token ?? null;
    }
    const refreshed = await Effect.runPromise(
      pushLogoutCleanup({
        credentials: logoutCredentials,
        now: () => Date.now() / 1000,
        refresh: (refreshToken) => refreshLogoutCredentials(auth, refreshToken),
        revoke: (accessToken) =>
          revokePushSession(config, accessToken).pipe(
            Effect.provideService(FetchHttpClient.Fetch, fetch),
          ),
      }),
    );
    if (!refreshed) throw new Error("Logout credentials unavailable");
    await logoutCredentials.complete(refreshed);
    return refreshed;
  };
