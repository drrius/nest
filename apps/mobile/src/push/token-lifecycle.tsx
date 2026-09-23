import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import * as Effect from "effect/Effect";
import { useSession } from "../session/provider";
import { PreferenceFailure } from "../preferences/client";
import {
  nativePushAttempts,
  nativePushCheckpoint,
  readNativePushInstallation,
} from "./native-storage";
import { nativePushToken } from "./native-permission";
import { pushEnrollmentOperations } from "./operations";
import { rotatePushDevice } from "./rotation";
import { pushRotationQueue } from "./rotation-queue";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function PushTokenLifecycle() {
  const { state, pushDevices } = useSession();
  const actor = state.status === "ready" ? state.member.userId : null;
  const household = state.status === "ready" ? state.member.householdId : null;
  useEffect(() => {
    if (!actor || !household || !pushDevices) return;
    const account = { actor, household };
    const queue = pushRotationQueue<Notifications.DevicePushToken | undefined>({
      active: () => AppState.currentState === "active",
      rotate: (token, current) =>
        rotatePushDevice({
          current,
          checkpoint: nativePushCheckpoint(account),
          readInstallation: Effect.tryPromise({
            try: readNativePushInstallation,
            catch: unavailable,
          }),
          token: nativePushToken(false, token).pipe(Effect.mapError(unavailable)),
          client: pushDevices,
          operations: pushEnrollmentOperations({
            account,
            client: pushDevices,
            store: nativePushAttempts,
            current,
          }),
          operationId: randomUUID,
        }),
    });
    const tokens = Notifications.addPushTokenListener(queue.changed);
    queue.changed(undefined);
    const foreground = AppState.addEventListener("change", (next) => {
      if (next === "active") queue.changed(undefined);
    });
    return () => {
      queue.dispose();
      tokens.remove();
      foreground.remove();
    };
  }, [actor, household, pushDevices]);
  return null;
}
