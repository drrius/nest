import * as Effect from "effect/Effect";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Schema from "effect/Schema";
import { allowsPush, pushPermission } from "./permission";
export class PushEnrollmentFailure extends Schema.TaggedError<PushEnrollmentFailure>()(
  "PushEnrollmentFailure",
  {
    reason: Schema.Literals(["configuration", "permission", "unavailable"]),
  },
) {}
export const nativePushPermission = () =>
  Effect.tryPromise({
    try: () => Notifications.getPermissionsAsync(),
    catch: () => new PushEnrollmentFailure({ reason: "unavailable" }),
  }).pipe(Effect.map(pushPermission));
const configuredProject = Effect.suspend(() => {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof projectId === "string" && Schema.is(Schema.String.check(Schema.isUUID()))(projectId)
    ? Effect.succeed(projectId)
    : Effect.fail(new PushEnrollmentFailure({ reason: "configuration" }));
});
// Called only by an explicit enrollment action; mounting a screen never prompts.
export function nativePushToken(
  requestPermission: boolean,
  devicePushToken?: Notifications.DevicePushToken,
) {
  return Effect.gen(function* () {
    const projectId = yield* configuredProject;
    let permission = yield* nativePushPermission();
    if (requestPermission && !allowsPush(permission) && permission.canAskAgain) {
      permission = yield* Effect.tryPromise({
        try: () =>
          Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: false, allowSound: false },
          }),
        catch: () => new PushEnrollmentFailure({ reason: "unavailable" }),
      }).pipe(Effect.map(pushPermission));
    }
    if (!allowsPush(permission)) return yield* new PushEnrollmentFailure({ reason: "permission" });
    const token = yield* Effect.tryPromise({
      try: () => Notifications.getExpoPushTokenAsync({ projectId, devicePushToken }),
      catch: () => new PushEnrollmentFailure({ reason: "unavailable" }),
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError(() => new PushEnrollmentFailure({ reason: "unavailable" })),
    );
    return token.data;
  });
}
