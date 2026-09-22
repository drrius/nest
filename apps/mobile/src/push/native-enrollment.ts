import * as Effect from "effect/Effect";
import { randomUUID } from "expo-crypto";
import type { Account } from "../offline/contracts";
import { PreferenceFailure } from "../preferences/client";
import type { EnrollmentDependencies } from "./enrollment-runtime";
import { pushEnrollmentOwner } from "./enrollment-owner";
import { nativePushPermission, nativePushToken } from "./native-permission";
import {
  nativePushAttempts,
  nativePushInstallation,
  readNativePushInstallation,
} from "./native-storage";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function nativeEnrollmentOwner(account: Account, client: EnrollmentDependencies["client"]) {
  return pushEnrollmentOwner({
    account,
    client,
    store: nativePushAttempts,
    installation: Effect.tryPromise({ try: nativePushInstallation, catch: unavailable }),
    readInstallation: Effect.tryPromise({ try: readNativePushInstallation, catch: unavailable }),
    permission: nativePushPermission().pipe(
      Effect.catch(() => Effect.succeed({ status: "unknown" as const, canAskAgain: false })),
    ),
    token: nativePushToken(true).pipe(Effect.mapError(unavailable)),
    operationId: randomUUID,
  });
}
