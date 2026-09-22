import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { logoutCredentials, nativeCleanupAuth } from "../session/native-client";
import { signInWithApple } from "../session/apple";
import type { SessionConfig } from "../session/config";
import { revokePreviousPushSession } from "./logout-client";
import { reauthenticatePushLogout } from "./logout-reauthentication";

export const recoverNativePushLogout = (config: SessionConfig) => async () => {
  const auth = nativeCleanupAuth(config);
  const cleanup = reauthenticatePushLogout({
    credentials: logoutCredentials,
    authenticate: signInWithApple(auth),
    revoke: (fresh, previous) =>
      revokePreviousPushSession(config, fresh, previous).pipe(
        Effect.provideService(FetchHttpClient.Fetch, fetch),
      ),
  });
  // The recovery sign-in is never published to the app. Retire it even when
  // the selected Apple identity is wrong or a later revocation step fails.
  const release = Effect.promise(() => auth.signOut({ scope: "local" })).pipe(
    Effect.timeout("15 seconds"),
    Effect.ignore,
  );
  return Effect.runPromise(cleanup.pipe(Effect.ensuring(release)));
};
